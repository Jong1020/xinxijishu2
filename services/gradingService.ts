import { GoogleGenAI, Type } from "@google/genai";
import { AIConfig, DocxData, GradingResult, GradingRule, ModelProvider, RuleResult } from "../types";

// 动态计算上下文限制
const getContextLimit = (config: AIConfig): number => {
  switch (config.provider) {
    case ModelProvider.GEMINI:
      return 800000; // Gemini Pro/Flash 拥有极大的上下文窗口
    case ModelProvider.DEEPSEEK:
      return 60000;  // DeepSeek V3/R1 上下文较大
    case ModelProvider.QWEN:
      return 30000;
    default:
      return 20000;  // 保守默认值
  }
};

const cleanXml = (xml: string, limit: number): string => {
  if (!xml) return "";
  // 移除命名空间干扰，减小 Token 占用，但保留属性
  let cleaned = xml.replace(/ xmlns:[^=]+="[^"]+"/g, "");
  
  if (cleaned.length > limit) {
      // 保留头部（通常包含样式定义）和尾部（通常包含页面设置 sectPr）
      const head = cleaned.slice(0, Math.floor(limit * 0.7));
      const tail = cleaned.slice(cleaned.length - Math.floor(limit * 0.3));
      return head + "\n...[Content Truncated]...\n" + tail;
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
  const limit = getContextLimit(config);
  const docContent = cleanXml(templateData.document, limit);
  const commentsContent = cleanXml(templateData.comments, 10000);
  const relsContent = cleanXml(templateData.rels, 5000);
  
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
  const limit = getContextLimit(config);
  
  const studentDoc = cleanXml(studentData.document, limit);
  const studentStyles = cleanXml(studentData.styles, 10000);
  const studentComments = cleanXml(studentData.comments, 5000);
  const studentRels = cleanXml(studentData.rels, 5000);
  const studentNumbering = cleanXml(studentData.numbering, 5000);

  let promptContext = templateData 
    ? `=== DIFFERENTIAL GRADING ===
       Compare STUDENT against TEMPLATE.
       TEMPLATE XML: ${cleanXml(templateData.document, 15000)}
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
    你是一名经验丰富的信息技术教师，正在对 Word 2010 文档 XML 进行精准评分。
    
    === 🔍 XML 导航与评分指南 (Navigation Guide) ===
    为了提高准确率，请遵循以下查找路径：

    1. **字体 (Font)**:
       - 查找 <w:rPr> (Run Properties) -> <w:rFonts w:ascii="..." w:eastAsia="..."/>
       - 注意：中文字体通常在 w:eastAsia，英文字体在 w:ascii。
       - 颜色: <w:color w:val="..."/> (Hex值) 或 <w:color w:themeColor="..."/>。

    2. **段落 (Paragraph)**:
       - 查找 <w:pPr> (Paragraph Properties)。
       - 对齐: <w:jc w:val="center|left|right|both"/>。
       - 缩进: <w:ind w:firstLine="200" (首行缩进, ~100 per char) /> 或 <w:ind w:left="..."/>。
       - 行距: <w:spacing w:line="360" (行距, 240=1倍) w:lineRule="auto|exact"/>。

    3. **页面设置与边距 (Page Setup)**:
       - **位置**: 必须查找文档 XML 末尾的 <w:sectPr> 标签，或者段落属性 <w:pPr> 中的 <w:sectPr> (分节符)。
       - **标签**: <w:pgMar w:top="..." w:bottom="..." w:left="..." w:right="..." ... />
       - **单位**: 数值单位为 **Twips** (1/1440 英寸)。
         * 1 厘米 ≈ 567 twips
         * 2 厘米 ≈ 1134 twips
         * 2.54 厘米 (1英寸) = 1440 twips
         * 3.17 厘米 ≈ 1800 twips
       - **判定**: 允许 ±5% 的数值误差。如果找不到 <w:sectPr>，请尝试在文档最后一部分查找。

    4. **艺术字 (WordArt) / 文本效果**:
       - Word 2010 艺术字通常是 <w:drawing> (DrawingML) 或 <v:shape> (VML)。
       - **标签**: 查找 <w:drawing> 下的 <a:graphic> -> <wps:wsp> (WordProcessingShape)。
       - **内容**: 在 <wps:txbx> -> <w:txbxContent> 中查找文字。
       - **效果**: 检查 <wps:spPr> (形状属性) 或 <w:rPr> 下的文本效果 (<w:textEffect>, <w:shadow>, <w:reflection>, <w:glow>)。
       - **注意**: 普通文本 <w:t> 不含这些效果。

    5. **删除的文字 (Deleted Text / Revisions)**:
       - **标签**: <w:del> 包裹的内容。
       - **内容检查类规则**: 忽略 <w:del> 标签内的文字，它们已被删除。只看 <w:t> 或 <w:ins> 中的文字。
       - **操作检查类规则**: 如果要求“删除某段文字”，若该文字被 <w:del> 包裹或完全消失，则视为【通过】。

    6. **表格行高 (Table Row Height)**:
       - 标签: <w:trPr> 下的 <w:trHeight w:val="NNN" w:hRule="..."/> (Twips)。

    === 🧠 评分执行策略 ===
    对于每一条规则，请按照以下步骤思考：
    1. **Locate**: 在 XML 中搜索相关的具体节点 (如 w:pgMar, w:rFonts)。
    2. **Extract**: 提取实际值 (如 w:top="1440")。
    3. **Verify**: 将提取值与规则要求对比 (如 1440 twips ≈ 2.54cm)。
    4. **Reason**: 如果通过，说明找到的值；如果不通过，说明实际找到的值是什么，或者是否完全未找到。
    
    输出格式必须是合法的 JSON：
    {
      "details": [
        {
          "ruleId": "规则ID",
          "passed": boolean,
          "reasoning": "简要说明理由，例如：'找到 w:pgMar w:top=\"1440\"，符合 2.54cm 的要求'",
          "extractedValue": "提取到的原始 XML 片段或数值，例如 '1440' 或 '宋体'",
          "originalValue": "预期值"
        }
      ],
      "summary": "一段自然、鼓励性的老师评语 (100字左右)。"
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
    const isDeepSeekReasoner = config.model.includes('reasoner');

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
              // DeepSeek R1 (reasoner) 不支持 json_object 模式，普通模型支持
              ...(!isDeepSeekReasoner && config.provider !== ModelProvider.DEEPSEEK ? { response_format: { type: 'json_object' } } : {})
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
      
      // 如果是推理模型，可能会包含 <think> 标签，需要移除
      jsonStr = jsonStr.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

      const startBracket = jsonStr.indexOf('[');
      const startBrace = jsonStr.indexOf('{');
      
      let startIndex = -1;
      if (startBracket !== -1 && startBrace !== -1) {
          startIndex = Math.min(startBracket, startBrace);
      } else if (startBracket !== -1) {
          startIndex = startBracket;
      } else {
          startIndex = startBrace;
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
          throw new Error("模型返回的数据格式错误，无法解析为 JSON。请尝试重新评分。");
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