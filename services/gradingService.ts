import { GoogleGenAI, Type } from "@google/genai";
import { AIConfig, GradingResult, GradingRule, ModelProvider, RuleResult } from "../types";

// Helper to clean XML to reduce token usage
const cleanXml = (xml: string): string => {
  // Remove namespace declarations to save tokens, keep structural tags
  return xml.replace(/ xmlns:[^=]+="[^"]+"/g, "").slice(0, 30000); // Hard truncate to avoid context limit if massive
};

export const generateRulesFromText = async (text: string, totalPoints: number): Promise<GradingRule[]> => {
  // Using Gemini for rule generation as it's the default capable model
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    Analyze the following exam requirements description and break it down into specific grading rules.
    Total Score available: ${totalPoints}.
    
    Description:
    ${text}

    Return a JSON array where each object has:
    - id: unique string
    - description: specific technical requirement in Simplified Chinese (e.g. "标题 '摘要' 应设置为黑体且居中")
    - points: number (distribute total points fairly)
    - category: string in Simplified Chinese (e.g., "格式", "内容", "页面布局")
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
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

    const json = JSON.parse(response.text || "[]");
    return json;
  } catch (e) {
    console.error("Failed to generate rules", e);
    throw new Error("Failed to generate rules from text.");
  }
};

export const gradeDocument = async (
  docXml: string,
  stylesXml: string,
  rules: GradingRule[],
  config: AIConfig
): Promise<GradingResult> => {
  
  const cleanedDoc = cleanXml(docXml);
  const cleanedStyles = cleanXml(stylesXml);

  const systemInstruction = `
    You are an expert IT Exam Grader. Your task is to verify if a Microsoft Word document meets specific grading criteria by analyzing its XML structure.
    
    You will receive:
    1. document.xml (Content and direct formatting)
    2. styles.xml (Style definitions)
    3. A list of Grading Rules
    
    For each rule, determine if it is PASSED or FAILED based on the XML tags and attributes.
    Common XML hints:
    - Bold: <w:b/>
    - Center Align: <w:jc w:val="center"/>
    - Font Size: <w:sz w:val="..."/> (value is half-points, e.g., 24 = 12pt)
    - Font Family: <w:rFonts .../>
    - Page Size: <w:pgSz .../>
    - Margins: <w:pgMar .../>
    
    Provide 'reasoning' and 'summary' in Simplified Chinese (简体中文).
    
    Return a strictly valid JSON object.
  `;

  const prompt = `
    Rules to Check:
    ${JSON.stringify(rules)}

    ---
    document.xml snippet:
    ${cleanedDoc}

    ---
    styles.xml snippet:
    ${cleanedStyles}
    ---
  `;

  if (config.provider === ModelProvider.GEMINI) {
    return gradeWithGemini(systemInstruction, prompt, rules, config.geminiModel);
  } else {
    return gradeWithDeepSeek(systemInstruction, prompt, rules, config);
  }
};

const gradeWithGemini = async (sysInst: string, prompt: string, rules: GradingRule[], modelName: string): Promise<GradingResult> => {
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
                  extractedValue: { type: Type.STRING }
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
    // DeepSeek API compatible request
    // Note: process.env.DEEPSEEK_API_KEY should be available if running locally with env vars
    // For this demo, we assume the environment is set up correctly.
    const apiKey = process.env.DEEPSEEK_API_KEY || ''; 
    
    const payload = {
        model: config.deepSeekModel,
        messages: [
            { role: "system", content: sysInst + " Respond with JSON only." },
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
            throw new Error(`DeepSeek API Error: ${response.statusText}`);
        }

        const data = await response.json();
        const content = data.choices[0].message.content;
        const rawResult = JSON.parse(content);
        
        return processGradingResponse(rawResult, rules);
    } catch (error) {
        console.error("DeepSeek Grading Error", error);
        throw error;
    }
};

const processGradingResponse = (rawResult: any, rules: GradingRule[]): GradingResult => {
    let calculatedTotal = 0;
    const maxScore = rules.reduce((acc, r) => acc + r.points, 0);

    const processedDetails: RuleResult[] = rawResult.details.map((d: any) => {
        const rule = rules.find(r => r.id === d.ruleId);
        const points = rule ? rule.points : 0;
        const score = d.passed ? points : 0;
        calculatedTotal += score;

        return {
            ruleId: d.ruleId,
            passed: d.passed,
            score: score,
            reasoning: d.reasoning,
            extractedValue: d.extractedValue || "N/A"
        };
    });

    return {
        totalScore: calculatedTotal,
        maxScore: maxScore,
        details: processedDetails,
        summary: rawResult.summary || "Grading completed."
    };
};