import { GoogleGenAI, Type } from "@google/genai";
import { AIConfig, DocxData, GradingResult, GradingRule, ModelProvider, RuleResult } from "../types";

// Helper to clean XML to reduce token usage
const cleanXml = (xml: string): string => {
  if (!xml) return "";
  // Remove namespace declarations and very long distinct attributes to save tokens
  // Keep structural tags and essential attributes (w:val, w:sz, etc.)
  let cleaned = xml.replace(/ xmlns:[^=]+="[^"]+"/g, "");
  
  // Truncate if massively large, but try to keep the body
  if (cleaned.length > 50000) {
      return cleaned.slice(0, 50000) + "...(truncated)";
  }
  return cleaned;
};

export const generateRulesFromText = async (text: string, totalPoints: number): Promise<GradingRule[]> => {
  if (!process.env.API_KEY) {
    throw new Error("未配置 API Key。请在部署环境的环境变量中配置 'API_KEY'。");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    Analyze the following IT exam requirements and break it down into specific grading rules.
    Total Score: ${totalPoints}.
    
    Requirements:
    ${text}

    Return a JSON array where each object has:
    - id: unique string
    - description: specific technical requirement in Simplified Chinese (e.g. "标题 '摘要' 应设置为黑体且居中")
    - points: number
    - category: string (e.g., "格式", "内容", "批注")
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp', // Or use a reliable model alias
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
        }
      }
    });

    return JSON.parse(response.text || "[]");
  } catch (e) {
    console.error("Failed to generate rules", e);
    throw new Error("规则生成失败，请检查 API Key 或网络连接。");
  }
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

  let promptContext = "";

  if (templateData) {
    const templateDoc = cleanXml(templateData.document);
    // Differential Grading Mode
    promptContext = `
    === MODE: DIFFERENTIAL GRADING (TEMPLATE VS STUDENT) ===
    You are an expert IT Exam Grader. Compare the STUDENT XML against the TEMPLATE (ORIGINAL) XML to verify if the student performed the required operations.
    
    IMPORTANT:
    1. Check if the student *changed* the document according to the rule.
    2. If the rule says "Delete the paragraph...", verify it exists in Template but NOT in Student.
    3. If the rule says "Reply to comment...", check the 'comments.xml' for responses.
    
    --- TEMPLATE (ORIGINAL) DOCUMENT XML SNIPPET ---
    ${templateDoc.slice(0, 20000)} ...
    
    --- STUDENT DOCUMENT XML SNIPPET ---
    ${studentDoc}
    
    --- STUDENT STYLES XML SNIPPET ---
    ${studentStyles}

    --- STUDENT COMMENTS XML SNIPPET ---
    ${studentComments}
    `;
  } else {
    // Standard Grading Mode
    promptContext = `
    === MODE: STANDARD GRADING ===
    You are an expert IT Exam Grader. Verify if the Microsoft Word document meets specific grading criteria by analyzing its XML structure.
    
    --- STUDENT DOCUMENT XML SNIPPET ---
    ${studentDoc}
    
    --- STUDENT STYLES XML SNIPPET ---
    ${studentStyles}
    
    --- STUDENT COMMENTS XML SNIPPET ---
    ${studentComments}
    `;
  }

  const systemInstruction = `
    Analyze the provided XML snippets against the specific Grading Rules.
    
    For each rule:
    1. Determine PASSED/FAILED.
    2. Extract the specific value found in the Student's file (e.g., "14pt", "Red").
    3. If Template is provided, extract the value from the Template as 'originalValue'.
    4. Provide reasoning in Simplified Chinese.
    
    Common XML Mapping:
    - Bold: <w:b/>
    - Center: <w:jc w:val="center"/>
    - Size: <w:sz w:val="X"/> (X/2 = pt size)
    - Font: <w:rFonts .../>
    - Margins: <w:pgMar .../>
    - Comments: <w:comment .../>
    
    Return STRICT JSON.
  `;

  const prompt = `
    ${promptContext}

    --- GRADING RULES ---
    ${JSON.stringify(rules)}
  `;

  if (config.provider === ModelProvider.GEMINI) {
    return gradeWithGemini(systemInstruction, prompt, rules, config.geminiModel);
  } else {
    return gradeWithDeepSeek(systemInstruction, prompt, rules, config);
  }
};

const gradeWithGemini = async (sysInst: string, prompt: string, rules: GradingRule[], modelName: string): Promise<GradingResult> => {
  if (!process.env.API_KEY) {
    throw new Error("未配置 API_KEY。请在部署平台的环境变量中设置。");
  }
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const response = await ai.models.generateContent({
      model: modelName, 
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

    const rawResult = JSON.parse(response.text || "{}");
    return processGradingResponse(rawResult, rules);

  } catch (error) {
    console.error("Gemini Grading Error", error);
    throw error;
  }
};

const gradeWithDeepSeek = async (sysInst: string, prompt: string, rules: GradingRule[], config: AIConfig): Promise<GradingResult> => {
    // Check for DeepSeek Key. 
    // Note: We access process.env directly as per system instructions not to add UI for keys.
    const apiKey = process.env.DEEPSEEK_API_KEY;

    if (!apiKey || apiKey === 'sk-placeholder') {
        throw new Error("未配置 DEEPSEEK_API_KEY。请在部署环境的环境变量中添加此 Key。");
    }

    const payload = {
        model: config.deepSeekModel,
        messages: [
            { role: "system", content: sysInst + " Return JSON format." },
            { role: "user", content: prompt }
        ],
        stream: false,
        response_format: { type: 'json_object' }
    };

    try {
        const response = await fetch(`${config.deepSeekBaseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`DeepSeek API Error: ${response.status} - ${errText}`);
        }

        const data = await response.json();
        const content = data.choices[0].message.content;
        const rawResult = JSON.parse(content);
        
        return processGradingResponse(rawResult, rules);
    } catch (error: any) {
        console.error("DeepSeek Grading Error", error);
        throw new Error(`DeepSeek 请求失败: ${error.message}`);
    }
};

const processGradingResponse = (rawResult: any, rules: GradingRule[]): GradingResult => {
    let calculatedTotal = 0;
    const maxScore = rules.reduce((acc, r) => acc + r.points, 0);

    const processedDetails: RuleResult[] = (rawResult.details || []).map((d: any) => {
        const rule = rules.find(r => r.id === d.ruleId);
        const points = rule ? rule.points : 0;
        const score = d.passed ? points : 0;
        calculatedTotal += score;

        return {
            ruleId: d.ruleId,
            passed: d.passed,
            score: score,
            reasoning: d.reasoning,
            extractedValue: d.extractedValue || "N/A",
            originalValue: d.originalValue || "N/A"
        };
    });

    return {
        totalScore: calculatedTotal,
        maxScore: maxScore,
        details: processedDetails,
        summary: rawResult.summary || "Grading completed."
    };
};