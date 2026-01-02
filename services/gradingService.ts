import { GoogleGenAI, Type, Schema } from "@google/genai";
import { AIConfig, DocxData, GradingResult, GradingRule, ModelProvider, RuleResult } from "../types";

// 动态计算上下文限制
const getContextLimit = (config: AIConfig): number => {
  switch (config.provider) {
    case ModelProvider.GEMINI:
      return 1000000; // Gemini 1.5/2.0 Flash 拥有极大的上下文窗口
    case ModelProvider.DEEPSEEK:
      return config.model.includes('reasoner') ? 128000 : 64000;  // DeepSeek R1 支持 128k
    case ModelProvider.QWEN:
      return 60000;   // Qwen-max 通常支持 30k-128k
    default:
      return 30000;
  }
};

const cleanXml = (xml: string, limit: number): string => {
  if (!xml) return "";
  
  // 1. 移除 XML 声明和命名空间
  let cleaned = xml.replace(/<\?xml.*?\?>/, "")
                   .replace(/ xmlns:[^=]+="[^"]+"/g, "");

  // 2. 深度清洗：移除 Word 内部标记噪声
  cleaned = cleaned.replace(/ w:rsid\w+="[^"]*"/g, "")
                   .replace(/ w:proof\w+="[^"]*"/g, "")
                   .replace(/ w:lang="[^"]*"/g, "")
                   .replace(/<w:proofErr[^>]*\/>/g, "")
                   .replace(/<w:bookmarkStart[^>]*\/>/g, "")
                   .replace(/<w:bookmarkEnd[^>]*\/>/g, "")
                   .replace(/<w:lastRenderedPageBreak\/>/g, "")
                   .replace(/<w:noBreakHyphen\/>/g, "")
                   .replace(/<w:softHyphen\/>/g, "");

  // 3. 智能截断
  if (cleaned.length > limit) {
      const headRatio = 0.6; 
      const tailRatio = 0.4;
      
      const headLimit = Math.floor(limit * headRatio);
      const tailLimit = Math.floor(limit * tailRatio);
      
      const head = cleaned.slice(0, headLimit);
      const tail = cleaned.slice(cleaned.length - tailLimit);
      
      return head + "\n...[中间正文内容已截断以优化Token]...\n" + tail;
  }
  return cleaned;
};

// 辅助函数：数组切片 (用于分批处理)
const chunkArray = <T>(array: T[], size: number): T[][] => {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
};

// 增强的 OpenAI 兼容接口调用函数 (含重试与 JSON 修正)
const callOpenAICompatible = async (
  systemPrompt: string,
  userPrompt: string,
  config: AIConfig,
  jsonMode: boolean = true
): Promise<any> => {
  const MAX_RETRIES = 2;
  let lastError;
  const isReasoner = config.model.includes('reasoner');

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      // R1 (reasoner) 可能会思考较久，增加超时时间
      const timeoutMs = isReasoner ? 180000 : 90000;
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(`${config.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          // DeepSeek R1 (reasoner) 不支持 temperature 参数
          ...(isReasoner ? {} : { temperature: 0.1 }),
          // DeepSeek R1 有时对 json_object 模式支持不稳定，建议关闭强制模式，依靠 Prompt
          response_format: (jsonMode && !isReasoner) ? { type: "json_object" } : undefined,
          stream: false
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      let content = data.choices?.[0]?.message?.content || "";

      // 清洗 <think> 标签 (DeepSeek R1)
      content = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

      // 尝试提取 Markdown 代码块中的 JSON
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/```([\s\S]*?)```/);
      if (jsonMatch) {
        content = jsonMatch[1];
      }

      if (jsonMode) {
        try {
          return JSON.parse(content);
        } catch (e) {
          console.warn(`JSON Parse failed on attempt ${attempt + 1}. Content snippet:`, content.substring(0, 100));
          // 简单的 JSON 修复尝试 (比如结尾缺少 })
          if (content.trim().endsWith(",")) content = content.trim().slice(0, -1) + "}";
          if (!content.trim().endsWith("}")) content += "}";
          
          try {
            return JSON.parse(content);
          } catch (e2) {
             throw new Error("Invalid JSON response");
          }
        }
      }

      return content;

    } catch (e: any) {
      console.warn(`Attempt ${attempt + 1} failed:`, e);
      lastError = e;
      if (attempt < MAX_RETRIES - 1) await new Promise(r => setTimeout(r, 1500)); 
    }
  }
  throw lastError;
};

// 测试连接函数
export const testConnection = async (config: AIConfig): Promise<string> => {
  const testPrompt = "请回复 JSON: {\"status\": \"ok\"}";
  
  try {
    if (config.provider === ModelProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: config.model,
        contents: testPrompt,
      });
      return response.text || "连接成功";
    } else {
      const res = await callOpenAICompatible("You are a helper.", testPrompt, config, true);
      return res.status === 'ok' ? "连接成功" : JSON.stringify(res);
    }
  } catch (e: any) {
    console.error("Connection test failed:", e);
    throw new Error(e.message || "连接模型时发生错误");
  }
};

// 统一调用逻辑：生成规则
const callForRules = async (prompt: string, config: AIConfig): Promise<GradingRule[]> => {
  let rawRules: any[] = [];

  if (config.provider === ModelProvider.GEMINI) {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: config.model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              description: { type: Type.STRING },
              points: { type: Type.NUMBER },
              category: { type: Type.STRING },
            },
            required: ["id", "description", "points", "category"]
          }
        },
        systemInstruction: "你是一位严谨的信息技术阅卷组长。请直接返回 JSON 数组。"
      }
    });
    rawRules = JSON.parse(response.text || "[]");
  } else {
    // OpenAI Compatible
    const result = await callOpenAICompatible(
      `你是一个评分专家。请将要求拆分为极细颗粒度的评分规则。
       返回格式必须是合法的 JSON 数组，例如：
       [{"id": "1", "description": "标题字体为黑体", "points": 2, "category": "格式"}]`,
      prompt,
      config
    );
    
    if (Array.isArray(result)) {
        rawRules = result;
    } else if (result && typeof result === 'object') {
        // 兼容某些模型返回 { rules: [...] }
        rawRules = result.rules || result.gradingRules || result.items || [];
    }
  }

  return rawRules.map((r: any, idx: number) => ({
      id: String(r.id || r.ruleId || `rule-${Date.now()}-${idx}`),
      description: String(r.description || r.desc || "无规则描述"),
      points: typeof r.points === 'number' ? r.points : (Number(r.points) || 1),
      category: String(r.category || "常规")
  }));
};

export const generateRulesFromText = async (text: string, totalPoints: number, config: AIConfig): Promise<GradingRule[]> => {
  const prompt = `
    任务：分析以下考试要求，拆分为原子化评分细则。
    总分：${totalPoints}分。
    
    要求：
    1. 每个评分点只能检查一个具体属性（如字体、字号需分开）。
    2. 必须包含具体参数值（如“红色”、“1.5倍行距”）。
    3. JSON字段: id, description, points, category。
    
    需求文本：
    ${text}
  `;
  return callForRules(prompt, config);
};

export const generateRulesFromTemplate = async (templateData: DocxData, totalPoints: number, config: AIConfig): Promise<GradingRule[]> => {
  const limit = getContextLimit(config);
  const docContent = cleanXml(templateData.document, limit);
  const commentsContent = cleanXml(templateData.comments, 10000);
  
  const prompt = `
    任务：从 Word XML 和批注(Comments)中提取评分规则。
    批注通常包含了具体的操作指令。
    总分：${totalPoints}分。
    
    XML Context:
    Main: ${docContent.slice(0, 15000)}
    Comments: ${commentsContent}
    
    请返回 JSON 数组。
  `;

  return callForRules(prompt, config);
};

// 核心评分函数
export const gradeDocument = async (
  studentData: DocxData,
  templateData: DocxData | null,
  rules: GradingRule[],
  config: AIConfig
): Promise<GradingResult> => {
  const limit = getContextLimit(config);
  
  // 准备上下文数据
  const studentDoc = cleanXml(studentData.document, limit);
  const studentStyles = cleanXml(studentData.styles, 15000);
  const studentComments = cleanXml(studentData.comments, 5000);
  const studentRels = cleanXml(studentData.rels, 5000);
  const studentNumbering = cleanXml(studentData.numbering, 5000);

  // 构建基础 XML 上下文
  let baseContext = "";
  if (templateData) {
     baseContext = `=== 模式：差异对比 (Differential Grading) ===
       [TEMPLATE XML (标准答案参考)]
       ${cleanXml(templateData.document, 10000)}
       
       [STUDENT XML (考生文件)]
       Main: ${studentDoc}
       Styles: ${studentStyles}`;
  } else {
     baseContext = `=== 模式：标准评分 ===
       [STUDENT XML]
       Main: ${studentDoc}
       Styles: ${studentStyles}
       Rels: ${studentRels}
       Numbering: ${studentNumbering}`;
  }

  let finalDetails: RuleResult[] = [];
  let summaryText = "";

  // 策略分支：Gemini vs 其他模型
  if (config.provider === ModelProvider.GEMINI) {
    // Gemini 策略：一次性发送所有规则 (利用长上下文优势)
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const rulesJson = JSON.stringify(rules.map(r => ({ id: r.id, desc: r.description, pts: r.points })));
    
    const prompt = `
      ${baseContext}
      
      === 任务：评分 ===
      请根据以上 XML 数据，逐条检查以下规则是否满足。
      
      评分规则列表:
      ${rulesJson}
      
      请严格基于 XML 属性值判断。例如：颜色值 hex 码必须匹配，字体名称必须匹配。
      
      返回格式：
      请返回一个 JSON 对象，包含 "details" 数组和 "summary" 字符串。
      details 数组项结构: { "ruleId": string, "passed": boolean, "score": number, "reasoning": string, "extractedValue": string }
      如果 passed 为 true，score 等于规则分值；否则为 0。
    `;

    const schema = {
      type: Type.OBJECT,
      properties: {
        summary: { type: Type.STRING },
        details: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              ruleId: { type: Type.STRING },
              passed: { type: Type.BOOLEAN },
              score: { type: Type.NUMBER },
              reasoning: { type: Type.STRING },
              extractedValue: { type: Type.STRING, description: "从 XML 中提取的实际值，用于调试" },
            },
            required: ["ruleId", "passed", "score", "reasoning"]
          }
        }
      },
      required: ["summary", "details"]
    };

    const response = await ai.models.generateContent({
      model: config.model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
      }
    });

    const result = JSON.parse(response.text || "{}");
    finalDetails = result.details || [];
    summaryText = result.summary || "评分完成";

  } else {
    // 非 Gemini 策略：分批评分 (Batch Grading)
    // 针对 DeepSeek R1 的优化：使用 Promise.all 并行请求，并调整 Batch Size
    const isReasoner = config.model.includes('reasoner');
    
    // R1 逻辑强且上下文大，Batch 可以大一点 (10)，减少请求次数开销
    // 普通模型 Batch 小一点 (5)，保证注意力不分散
    const BATCH_SIZE = isReasoner ? 10 : 5; 
    const ruleChunks = chunkArray(rules, BATCH_SIZE);
    
    // 并行执行所有 Batch 请求
    const batchPromises = ruleChunks.map(async (chunk, index) => {
        const chunkJson = JSON.stringify(chunk.map(r => ({ id: r.id, description: r.description, points: r.points })));
        
        const batchPrompt = `
          ${baseContext}
          
          === 评分任务 (批次 ${index + 1}/${ruleChunks.length}) ===
          请只分析以下 ${chunk.length} 条规则：
          ${chunkJson}
          
          对于每条规则，判断 XML 中是否包含对应的属性设置。
          
          ${isReasoner ? "【R1 模型特别说明】\n请先在 <think> 标签中进行详细的 XML 路径查找和值比对推理，确保逻辑严密。然后必须输出合法的 JSON。" : ""}
          
          【重要】返回 JSON 格式示例：
          {
            "results": [
              {
                "ruleId": "规则ID",
                "passed": false,
                "score": 0,
                "reasoning": "未找到相关属性",
                "extractedValue": "N/A"
              }
            ]
          }
        `;

        try {
          const batchResult = await callOpenAICompatible(
            "你是一个精确的 XML 代码分析引擎。只返回 JSON。",
            batchPrompt,
            config
          );

          if (batchResult && Array.isArray(batchResult.results)) {
            return batchResult.results;
          }
          return [];
        } catch (e) {
          console.error(`Batch ${index} failed:`, e);
          // 发生错误时返回默认失败结果，避免整个评分挂掉
          return chunk.map(r => ({
             ruleId: r.id,
             passed: false,
             score: 0,
             reasoning: "AI 服务连接中断或超时",
             extractedValue: "Error"
          }));
        }
    });

    // 等待所有并行请求完成
    const allResults = await Promise.all(batchPromises);
    allResults.forEach(res => finalDetails.push(...res));

    // 生成简短评语
    const passCount = finalDetails.filter(d => d.passed).length;
    summaryText = `评分完成。共 ${rules.length} 个评分点，通过 ${passCount} 个。`;
  }

  // 计算总分并确保数据完整性
  let calculatedTotal = 0;
  const maxScore = rules.reduce((acc, r) => acc + r.points, 0);
  
  const validatedDetails = rules.map(rule => {
    const detail = finalDetails.find(d => d.ruleId === rule.id);
    if (detail) {
      const score = detail.passed ? rule.points : 0;
      calculatedTotal += score;
      return {
        ...detail,
        score, // 强制校准分值
        ruleId: rule.id
      };
    } else {
      // 缺失的规则结果视为未通过
      return {
        ruleId: rule.id,
        passed: false,
        score: 0,
        reasoning: "AI 未返回该项结果 (可能是因为上下文截断)",
        extractedValue: "Unknown"
      };
    }
  });

  return {
    totalScore: calculatedTotal,
    maxScore: maxScore,
    details: validatedDetails,
    summary: summaryText
  };
};
