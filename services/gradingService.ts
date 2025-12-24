import { GoogleGenAI, Type } from "@google/genai";
import { AIConfig, DocxData, GradingResult, GradingRule, ModelProvider, RuleResult } from "../types";

const cleanXml = (xml: string): string => {
  if (!xml) return "";
  // 移除命名空间干扰，减小 Token 占用，但保留属性
  let cleaned = xml.replace(/ xmlns:[^=]+="[^"]+"/g, "");
  // 增加长度限制，避免丢失关键信息（如底部的表格）
  if (cleaned.length > 80000) {
      return cleaned.slice(0, 80000) + "...(truncated)";
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
        responseSchema: schema,
        systemInstruction: "你是一位严谨的信息技术阅卷组长，擅长将复杂的考试要求拆分为最细颗粒度的评分规则。请直接返回 JSON 数组。"
      }
    });
    rawRules = JSON.parse(response.text || "[]");
  } else {
    const result = await callOpenAICompatible(
      "你是一个信息技术考试评分专家。你的任务是将考试要求拆分为【极细颗粒度】的原子化评分点。例如：'设置标题为黑体三号红色'必须拆分为'字体名称:黑体'、'字号大小:三号'、'字体颜色:红色'三个独立规则。请直接返回 JSON 数组格式。",
      prompt,
      config
    );
    
    if (Array.isArray(result)) {
        rawRules = result;
    } else if (result && typeof result === 'object') {
        if (Array.isArray(result.rules)) rawRules = result.rules;
        else if (Array.isArray(result.gradingRules)) rawRules = result.gradingRules;
        else if (Array.isArray(result.items)) rawRules = result.items;
        else rawRules = [];
    }
  }

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
    作为信息技术考试专家，请深入分析以下需求并拆分为【极其细致、原子化】的评分细则。
    
    原子化准则：
    1. 单一操作原则：每个评分点仅检查一个属性。如“设置字体、字号、颜色”需拆分为3条规则。
    2. 参数明确：必须包含具体值，如“字号:18磅”、“行间距:24磅”、“段前间距:1行”。
    3. 全面覆盖：不错过任何隐藏的操作要求（如纸张大小、页边距、纹理、表格行高等）。
    
    总分限制：${totalPoints}分。请根据操作难度在规则间科学分配这${totalPoints}分（通常每项0.5-5分不等）。
    
    待拆分的需求：
    ${text}
    
    返回 JSON 数组，包含：id, description (简体中文详细描述), points, category。
  `;

  return callForRules(prompt, config);
};

// 从模板文档 XML（含批注）智能生成规则
export const generateRulesFromTemplate = async (templateData: DocxData, totalPoints: number, config: AIConfig): Promise<GradingRule[]> => {
  const docContent = cleanXml(templateData.document);
  const commentsContent = cleanXml(templateData.comments);
  const relsContent = cleanXml(templateData.rels);
  
  const prompt = `
    你正在进行高精度的信息技术自动阅卷规则提取。
    提供的 XML 包含 Word 主文档片段和相关的“批注（Comments）”。批注中记录了对考生的操作指令。
    
    任务：
    1. 解析 <w:comment> 中的文本，将其拆分为原子化的评分规则。
    2. 如果一个批注包含多条指令（例：“首行缩进2字符，段后0.5行”），必须拆分为两个规则。
    3. 结合主文档 XML 的上下文，确定具体的格式参数。
    4. 在所有规则间分配总分 ${totalPoints}。
    
    MAIN XML 片段: ${docContent.slice(0, 20000)}
    COMMENTS XML 内容: ${commentsContent}
    RELS XML (参考资源): ${relsContent.slice(0, 5000)}
    
    返回 JSON 数组，包含：id, description (详细技术要求描述), points, category。
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
  const studentRels = cleanXml(studentData.rels);
  const studentNumbering = cleanXml(studentData.numbering);

  let promptContext = templateData 
    ? `=== DIFFERENTIAL GRADING ===
       Compare STUDENT against TEMPLATE.
       TEMPLATE XML: ${cleanXml(templateData.document).slice(0, 15000)}
       STUDENT XML: ${studentDoc}
       STYLES XML: ${studentStyles}
       RELS XML: ${studentRels}
       NUMBERING XML: ${studentNumbering}
       COMMENTS XML: ${studentComments}`
    : `=== STANDARD GRADING ===
       Analyze STUDENT structure.
       STUDENT XML: ${studentDoc}
       STYLES XML: ${studentStyles}
       RELS XML: ${studentRels}
       NUMBERING XML: ${studentNumbering}
       COMMENTS XML: ${studentComments}`;

  const systemInstruction = `
    你是一名经验丰富的信息技术教师。请严格按照评分细则对比 XML 结构，进行客观评分。
    
    评分核心原则：
    1. 原子化检查：每个 RuleId 对应一个具体的格式或内容属性。
    2. 严格匹配：格式属性必须精确符合要求。

    === 关键技术指标检测指南 (Technical Specs) ===
    
    1. 表格行高 (Table Row Height):
       - 标签: <w:trPr> 下的 <w:trHeight w:val="NNN" w:hRule="..."/>
       - w:val 单位为 Twips (1/1440 英寸)。
       - 换算公式: 1 厘米 ≈ 567 twips, 1 磅 = 20 twips。
       - 允许±5%的数值误差。

    2. 字体与段落:
       - 字体: <w:rPr><w:rFonts .../></w:rPr>
       - 段落: <w:pPr><w:ind .../>(缩进) <w:jc .../>(对齐) <w:spacing .../>(间距)</w:pPr>
    
    输出格式必须是合法的 JSON：
    {
      "details": [{"ruleId": "...", "passed": boolean, "reasoning": "...", "extractedValue": "...", "originalValue": "..."}],
      "summary": "请提供一段老师的评语。要求：\n1. 语气自然、亲切，不要机械化。\n2. **严禁**总是以“哇哦”、“同学”等固定词汇开头，请根据具体得分情况灵活开场。\n3. 指出做得好的地方和需要改进的地方。\n4. 字数100字左右。"
    }
    评分细则列表：${JSON.stringify(rules)}
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
      
      let jsonStr = content.replace(/```json\n?|```/g, "").trim();
      
      const startBracket = jsonStr.indexOf('[');
      const startBrace = jsonStr.indexOf('{');
      
      let startIndex = -1;
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