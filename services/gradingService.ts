
import { GoogleGenAI } from "@google/genai";
import { AIConfig, DocxData, GradingResult, GradingRule, ModelProvider, RuleResult } from "../types";

// 动态计算上下文限制
const getContextLimit = (config: AIConfig): number => {
  switch (config.provider) {
    case ModelProvider.GEMINI:
      return 1000000;
    case ModelProvider.DEEPSEEK:
      return config.model.includes('reasoner') ? 128000 : 64000;
    default:
      return 32000;
  }
};

/**
 * 精准 XML 清洗：保留关键格式标签，移除无用干扰
 */
const cleanXml = (xml: string, limit: number): string => {
  if (!xml) return "";
  
  let cleaned = xml
    .replace(/<\?xml.*?\?>/, "")
    .replace(/ xmlns:[^=]+="[^"]+"/g, "")
    .replace(/ w:rsid\w+="[^"]*"/g, "")
    .replace(/ w:proof\w+="[^"]*"/g, "")
    // 移除大量冗余的段落合并标记
    .replace(/<w:pPr>\s*<w:pStyle[^>]*\/>\s*<\/w:pPr>/g, "");

  if (cleaned.length > limit) {
      const head = cleaned.slice(0, Math.floor(limit * 0.6));
      const tail = cleaned.slice(-Math.floor(limit * 0.4));
      return `${head}\n...[为了性能已截断中间部分]...\n${tail}`;
  }
  return cleaned;
};

/**
 * 强力 JSON 提取与修复引擎
 */
const extractAndRepairJson = (raw: string): any => {
  let content = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  
  // 1. 尝试从 Markdown 代码块提取
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch) content = jsonMatch[1];

  // 2. 如果还是不规范，尝试寻找第一个 { 和最后一个 }
  const firstBrace = content.indexOf('{');
  const lastBrace = content.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    content = content.substring(firstBrace, lastBrace + 1);
  }

  try {
    return JSON.parse(content);
  } catch (e) {
    // 3. 基础语法修复（处理末尾逗号等常见错误）
    content = content
      .replace(/,\s*([}\]])/g, '$1') // 移除末尾逗号
      .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '"$2":'); // 确保键名有双引号
    
    try {
      return JSON.parse(content);
    } catch (e2) {
      console.error("Critical JSON failure:", content);
      throw new Error("模型返回数据格式损坏，已自动记录");
    }
  }
};

/**
 * 通用 AI 调用引擎，适配 Gemini SDK 和 OpenAI 兼容接口
 */
const callAI = async (
  systemPrompt: string,
  userPrompt: string,
  config: AIConfig,
  jsonMode: boolean = true
): Promise<any> => {
  if (config.provider === ModelProvider.GEMINI) {
    // Use Gemini SDK for Gemini provider
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: config.model,
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        ...(jsonMode ? { responseMimeType: "application/json" } : {}),
      },
    });
    const text = response.text || "";
    return jsonMode ? extractAndRepairJson(text) : text;
  }
  // Fallback to fetch for OpenAI-compatible providers
  return callOpenAICompatible(systemPrompt, userPrompt, config, jsonMode);
};

/**
 * 带指数退避的 API 调用 (针对 OpenAI 兼容接口)
 */
const callOpenAICompatible = async (
  systemPrompt: string,
  userPrompt: string,
  config: AIConfig,
  jsonMode: boolean = true
): Promise<any> => {
  const MAX_RETRIES = 3;
  const isReasoner = config.model.includes('reasoner');

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutMs = isReasoner ? 240000 : 120000; // 推理模型给 4 分钟
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
          ...(isReasoner ? {} : { temperature: 0.1 }),
          // 注意：DeepSeek 官方 R1 在某些 Provider 下开启 json_object 会报错
          response_format: (jsonMode && !isReasoner) ? { type: "json_object" } : undefined,
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.status === 429) {
        const delay = Math.pow(2, attempt) * 2000;
        console.warn(`Rate limited. Waiting ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";
      
      return jsonMode ? extractAndRepairJson(content) : content;

    } catch (e: any) {
      if (attempt === MAX_RETRIES - 1) throw e;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
};

export const testConnection = async (config: AIConfig): Promise<string> => {
  try {
    if (config.provider === ModelProvider.GEMINI) {
      // Create new instance right before the call
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({ model: config.model, contents: "hi" });
      // Direct access to text property
      return response.text || "OK";
    }
    const res = await callOpenAICompatible("Helper", "Say OK in JSON: {\"status\":\"OK\"}", config, true);
    return res.status === 'OK' ? "连接成功" : "响应异常";
  } catch (e: any) {
    throw new Error(`连接失败: ${e.message}`);
  }
};

export const generateRulesFromText = async (text: string, totalPoints: number, config: AIConfig): Promise<GradingRule[]> => {
  const system = "你是一位信息技术高级阅卷员。你需要将要求拆分为颗粒度极小的评分点。";
  const user = `将以下要求拆分为 JSON 数组，总分 ${totalPoints}。
    示例格式：[{"id":"1","description":"设置标题为黑体","points":2,"category":"格式"}]
    内容：${text}`;
  
  // Use generic caller to support Gemini
  const rules = await callAI(system, user, config, true);
  return Array.isArray(rules) ? rules : (rules.rules || []);
};

export const generateRulesFromTemplate = async (templateData: DocxData, totalPoints: number, config: AIConfig): Promise<GradingRule[]> => {
  const system = "分析 Word XML 和批注提取评分规则。";
  const user = `XML 内容：${cleanXml(templateData.document, 10000)}
    批注：${cleanXml(templateData.comments, 5000)}
    提取总分为 ${totalPoints} 的规则数组。`;
  
  // Use generic caller to support Gemini
  const rules = await callAI(system, user, config, true);
  return Array.isArray(rules) ? rules : (rules.rules || []);
};

export const gradeDocument = async (
  studentData: DocxData,
  templateData: DocxData | null,
  rules: GradingRule[],
  config: AIConfig
): Promise<GradingResult> => {
  const limit = getContextLimit(config);
  const isReasoner = config.model.includes('reasoner');

  const context = `
    [STUDENT_XML_BODY]
    ${cleanXml(studentData.document, limit)}
    [STUDENT_STYLES]
    ${cleanXml(studentData.styles, 10000)}
    ${templateData ? `[REFERENCE_XML]\n${cleanXml(templateData.document, 10000)}` : ""}
  `;

  // Few-Shot 示例
  const exampleOutput = `
    {
      "results": [
        {"ruleId": "r1", "passed": true, "score": 2, "reasoning": "在 w:rPr 中找到 w:b 标签，确认已加粗", "extractedValue": "bold: true"}
      ],
      "summary": "表现良好"
    }
  `;

  const system = `你是一个精准的 Word XML 分析引擎。
    你的任务是判断学生 XML 是否满足特定的格式规则。
    必须通过检查 <w:sz>, <w:jc>, <w:color>, <w:rFonts> 等具体标签来判断。
    
    ${isReasoner ? "请先在 <think> 中列出你查找到的 XML 关键节点路径和属性值，进行逻辑推理后再给出 JSON。" : ""}
    
    输出必须严格遵守以下 JSON 结构：
    ${exampleOutput}`;

  // 分批处理以防止长文本导致的注意力分散
  const BATCH_SIZE = (isReasoner || config.provider === ModelProvider.GEMINI) ? 8 : 4;
  const chunks = [];
  for (let i = 0; i < rules.length; i += BATCH_SIZE) {
    chunks.push(rules.slice(i, i + BATCH_SIZE));
  }

  const allResults: RuleResult[] = [];
  
  // 使用并行处理提升响应速度
  const batchPromises = chunks.map(async (chunk) => {
    const user = `
      待查规则：${JSON.stringify(chunk)}
      XML 数据：${context}
      请评分并返回 JSON。
    `;
    try {
      // Use generic caller to support Gemini
      const res = await callAI(system, user, config, true);
      return res.results || [];
    } catch (e) {
      return chunk.map(r => ({ ruleId: r.id, passed: false, score: 0, reasoning: "分析超时或格式错误" }));
    }
  });

  const resolvedBatches = await Promise.all(batchPromises);
  resolvedBatches.forEach(batch => allResults.push(...batch));

  const totalScore = allResults.reduce((sum, r) => sum + (r.passed ? (rules.find(rule => rule.id === r.ruleId)?.points || 0) : 0), 0);
  const maxScore = rules.reduce((sum, r) => sum + r.points, 0);

  return {
    totalScore,
    maxScore,
    details: allResults,
    summary: `已完成 ${rules.length} 项检查。`
  };
};
