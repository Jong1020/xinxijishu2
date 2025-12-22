import { GoogleGenAI, Type } from "@google/genai";
import { AIConfig, DocxData, GradingResult, GradingRule, ModelProvider, RuleResult } from "../types";

const cleanXml = (xml: string): string => {
  if (!xml) return "";
  // 移除命名空间干扰，减小 Token 占用
  let cleaned = xml.replace(/ xmlns:[^=]+="[^"]+"/g, "");
  if (cleaned.length > 50000) {
      return cleaned.slice(0, 50000) + "...(truncated)";
  }
  return cleaned;
};

// 测试连接函数
export const testConnection = async (config: AIConfig): Promise<string> => {
  const testPrompt = "请回复：连接成功";
  
  try {
    if (config.provider === ModelProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: config.model,
        contents: testPrompt,
      });
      return response.text || "连接成功";
    } else {
      const response = await fetch(`${config.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${config.apiKey}`
          },
          body: JSON.stringify({
              model: config.model,
              messages: [{ role: "user", content: testPrompt }],
              max_tokens: 10
          })
      });

      if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData?.error?.message || `状态码: ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0].message.content || "连接成功";
    }
  } catch (e: any) {
    console.error("Connection test failed:", e);
    throw new Error(e.message || "连接模型时发生错误");
  }
};

// 统一调用逻辑
const callForRules = async (prompt: string, config: AIConfig): Promise<GradingRule[]> => {
  const schema = {
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
  };

  let rawRules: any[] = [];

  if (config.provider === ModelProvider.GEMINI) {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: config.model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema
      }
    });
    rawRules = JSON.parse(response.text || "[]");
  } else {
    const result = await callOpenAICompatible(
      "你是一个 IT 考试评分专家。请直接返回 JSON 数组格式的评分规则。",
      prompt,
      config
    );
    
    // 增强的结构兼容性处理：Qwen/DeepSeek 可能返回嵌套结构
    if (Array.isArray(result)) {
        rawRules = result;
    } else if (result && typeof result === 'object') {
        // 尝试查找常见字段
        if (Array.isArray(result.rules)) rawRules = result.rules;
        else if (Array.isArray(result.gradingRules)) rawRules = result.gradingRules;
        else if (Array.isArray(result.items)) rawRules = result.items;
        else {
            // 如果返回的是单个对象，或者结构无法识别，返回空数组防止崩溃
            console.warn("Received object but could not find rules array:", result);
            rawRules = [];
        }
    }
  }

  // 防御性映射：确保每个规则都符合 GradingRule 接口，避免 UI 渲染崩溃
  return rawRules.map((r: any, idx: number) => ({
      id: String(r.id || r.ruleId || `rule-${Date.now()}-${idx}`),
      description: String(r.description || r.desc || "无规则描述"),
      points: typeof r.points === 'number' ? r.points : (Number(r.points) || 1),
      category: String(r.category || "常规")
  }));
};

// 从纯文本描述生成规则
export const generateRulesFromText = async (text: string, totalPoints: number, config: AIConfig): Promise<GradingRule[]> => {
  const prompt = `
    Analyze the following IT exam requirements and break it down into specific grading rules.
    Total Score: ${totalPoints}.
    Requirements: ${text}
    Return a JSON array where each object has:
    - id: unique string
    - description: specific technical requirement in Simplified Chinese
    - points: number
    - category: string
  `;

  return callForRules(prompt, config);
};

// 从模板文档 XML（含批注）智能生成规则
export const generateRulesFromTemplate = async (templateData: DocxData, totalPoints: number, config: AIConfig): Promise<GradingRule[]> => {
  const docContent = cleanXml(templateData.document);
  const commentsContent = cleanXml(templateData.comments);
  
  const prompt = `
    You are an IT exam expert. I will provide the XML structure of a Word document and its associated comments.
    The comments (批注) contain the actual "operation instructions" for students.
    
    TASK:
    1. Scan the <w:comment> sections in the Comments XML.
    2. Correlate instructions with the document structure in the Main XML.
    3. Convert each unique instruction into a structured grading rule.
    4. Distribute the total score of ${totalPoints} across these rules.
    
    MAIN XML (Snippet): ${docContent.slice(0, 20000)}
    COMMENTS XML: ${commentsContent}
    
    Return a JSON array of rules with: id, description (Chinese), points, category.
  `;

  return callForRules(prompt, config);
};

export const gradeDocument = async (
  studentData: DocxData,
  templateData: DocxData | null,
  rules: GradingRule[],
  config: AIConfig
): Promise<GradingResult> => {
  const studentDoc = cleanXml(studentData.document);
  const studentStyles = cleanXml(studentData.styles);
  const studentComments = cleanXml(studentData.comments);

  let promptContext = templateData 
    ? `=== DIFFERENTIAL GRADING ===
       Compare STUDENT against TEMPLATE.
       TEMPLATE XML: ${cleanXml(templateData.document).slice(0, 15000)}
       STUDENT XML: ${studentDoc}
       STYLES XML: ${studentStyles}
       COMMENTS XML: ${studentComments}`
    : `=== STANDARD GRADING ===
       Analyze STUDENT structure.
       STUDENT XML: ${studentDoc}
       STYLES XML: ${studentStyles}
       COMMENTS XML: ${studentComments}`;

  const systemInstruction = `
    Analyze XML against Rules. You must return a VALID JSON object.
    Output Format:
    {
      "details": [{"ruleId": "...", "passed": boolean, "reasoning": "...", "extractedValue": "...", "originalValue": "..."}],
      "summary": "..."
    }
    Rules: ${JSON.stringify(rules)}
  `;

  if (config.provider === ModelProvider.GEMINI) {
    return gradeWithGemini(systemInstruction, promptContext, rules, config);
  } else {
    const rawResult = await callOpenAICompatible(systemInstruction, promptContext, config);
    return processGradingResponse(rawResult, rules);
  }
};

const gradeWithGemini = async (sysInst: string, prompt: string, rules: GradingRule[], config: AIConfig): Promise<GradingResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const response = await ai.models.generateContent({
    model: config.model,
    contents: prompt,
    config: {
      systemInstruction: sysInst,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          details: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                ruleId: { type: Type.STRING },
                passed: { type: Type.BOOLEAN },
                reasoning: { type: Type.STRING },
                extractedValue: { type: Type.STRING },
                originalValue: { type: Type.STRING }
              },
              required: ["ruleId", "passed", "reasoning"]
            }
          },
          summary: { type: Type.STRING }
        },
        required: ["details", "summary"]
      }
    }
  });

  return processGradingResponse(JSON.parse(response.text || "{}"), rules);
};

const callOpenAICompatible = async (sysInst: string, prompt: string, config: AIConfig): Promise<any> => {
    if (!config.apiKey) throw new Error(`${config.provider} API Key 未配置`);

    const baseUrl = config.baseUrl.replace(/\/+$/, "");

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${config.apiKey}`
          },
          body: JSON.stringify({
              model: config.model,
              messages: [
                  { role: "system", content: sysInst },
                  { role: "user", content: prompt }
              ],
              stream: false,
              ...(config.provider === ModelProvider.DEEPSEEK ? { response_format: { type: 'json_object' } } : {})
          })
      });

      if (!response.ok) {
          const errBody = await response.text();
          throw new Error(`API 请求失败 (${response.status}): ${errBody.slice(0, 100)}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";
      
      // 增强的 JSON 提取逻辑
      let jsonStr = content.replace(/```json\n?|```/g, "").trim();
      
      // 尝试提取第一个合法 JSON 对象或数组（应对模型返回前言/后语的情况）
      const startBracket = jsonStr.indexOf('[');
      const startBrace = jsonStr.indexOf('{');
      
      let startIndex = -1;
      // 找最前面的 { 或 [
      if (startBracket !== -1 && startBrace !== -1) {
          startIndex = Math.min(startBracket, startBrace);
      } else {
          startIndex = Math.max(startBracket, startBrace);
      }
      
      if (startIndex !== -1) {
          const endBracket = jsonStr.lastIndexOf(']');
          const endBrace = jsonStr.lastIndexOf('}');
          const endIndex = Math.max(endBracket, endBrace);
          if (endIndex > startIndex) {
             jsonStr = jsonStr.substring(startIndex, endIndex + 1);
          }
      }

      try {
          return JSON.parse(jsonStr);
      } catch (e) {
          console.error("JSON Parse Error. Raw content:", content);
          throw new Error("模型返回的数据格式错误，无法解析为 JSON");
      }
    } catch (e: any) {
      console.error("OpenAI Compatible Call Error:", e);
      throw new Error(`模型调用失败: ${e.message}`);
    }
};

const processGradingResponse = (rawResult: any, rules: GradingRule[]): GradingResult => {
    let calculatedTotal = 0;
    const maxScore = rules.reduce((acc, r) => acc + r.points, 0);

    // 防御性访问 details
    const rawDetails = Array.isArray(rawResult?.details) ? rawResult.details : [];

    const processedDetails: RuleResult[] = rawDetails.map((d: any) => {
        const rule = rules.find(r => r.id === d.ruleId);
        const points = rule ? rule.points : 0;
        const score = d.passed ? points : 0;
        calculatedTotal += score;
        return {
            ruleId: d.ruleId,
            passed: !!d.passed,
            score: score,
            reasoning: d.reasoning || "无理由说明",
            extractedValue: d.extractedValue || "N/A",
            originalValue: d.originalValue || "N/A"
        };
    });

    return {
        totalScore: calculatedTotal,
        maxScore: maxScore,
        details: processedDetails,
        summary: rawResult?.summary || "评分完成。"
    };
};
