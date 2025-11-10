import type { CodeAnalysisResult } from "@/shared/types";
import { LLMService } from '@/shared/services/llm';
import { getCurrentLLMApiKey, getCurrentLLMModel, env } from '@/shared/config/env';
import type { LLMConfig } from '@/shared/services/llm/types';
import { SUPPORTED_LANGUAGES } from '@/shared/constants';

/**
 * 基于 LLM 的代码分析引擎
 * 
 * @deprecated 此类包含前端直接调用 LLM 的逻辑
 * 
 * 所有代码分析现在都应该通过后端 API 进行：
 * - 即时分析：使用 api.analyzeInstantCode()
 * - 仓库扫描：使用 createRepositoryAuditTask()
 * 
 * 此类仅保留用于兼容性，未来版本将删除
 */
export class CodeAnalysisEngine {
  static getSupportedLanguages(): string[] {
    return [...SUPPORTED_LANGUAGES];
  }

  /**
   * 创建LLM服务实例
   * @deprecated 建议使用后端 API 进行分析，LLM 配置由后端统一管理
   */
  private static createLLMService(): LLMService {
    const apiKey = getCurrentLLMApiKey();
    
    // 不再强制要求 API Key，因为 LLM 配置现在由后端管理
    // 如果使用前端直接调用（不推荐），会在实际调用时报错
    if (!apiKey) {
      console.warn(
        `⚠️ 未配置 ${env.LLM_PROVIDER} API Key\n` +
        `建议使用后端 API 进行分析（更安全、更可靠）\n` +
        `如需使用前端直接调用，请配置相应的 API Key`
      );
    }

    const config: LLMConfig = {
      provider: env.LLM_PROVIDER as any,
      apiKey: apiKey || '', // 允许空字符串，在实际调用时会失败
      model: getCurrentLLMModel(),
      baseUrl: env.LLM_BASE_URL,
      timeout: env.LLM_TIMEOUT,
      temperature: env.LLM_TEMPERATURE,
      maxTokens: env.LLM_MAX_TOKENS,
    };

    return new LLMService(config);
  }

  static async analyzeCode(code: string, language: string): Promise<CodeAnalysisResult> {
    const llmService = this.createLLMService();

    // 获取输出语言配置
    const outputLanguage = env.OUTPUT_LANGUAGE || 'zh-CN';
    const isChineseOutput = outputLanguage === 'zh-CN';

    const schema = `{
      "issues": [
        {
          "type": "security|bug|performance|style|maintainability",
          "severity": "critical|high|medium|low",
          "title": "string",
          "description": "string",
          "suggestion": "string",
          "line": 1,
          "column": 1,
          "code_snippet": "string",
          "ai_explanation": "string",
          "xai": {
            "what": "string",
            "why": "string",
            "how": "string",
            "learn_more": "string(optional)"
          }
        }
      ],
      "quality_score": 0-100,
      "summary": {
        "total_issues": number,
        "critical_issues": number,
        "high_issues": number,
        "medium_issues": number,
        "low_issues": number
      },
      "metrics": {
        "complexity": 0-100,
        "maintainability": 0-100,
        "security": 0-100,
        "performance": 0-100
      }
    }`;

    // 根据配置生成不同语言的提示词
    const systemPrompt = isChineseOutput
      ? `⚠️⚠️⚠️ 只输出JSON，禁止输出其他任何格式！禁止markdown！禁止文本分析！⚠️⚠️⚠️

你是一个专业的代码审计助手。你的任务是分析代码并返回严格符合JSON Schema的结果。

【最重要】输出格式要求：
1. 必须只输出纯JSON对象，从{开始，到}结束
2. 禁止在JSON前后添加任何文字、说明、markdown标记
3. 禁止输出\`\`\`json或###等markdown语法
4. 如果是文档文件（如README），也必须以JSON格式输出分析结果

【内容要求】：
1. 所有文本内容必须统一使用简体中文
2. JSON字符串值中的特殊字符必须正确转义（换行用\\n，双引号用\\"，反斜杠用\\\\）
3. code_snippet字段必须使用\\n表示换行

请从以下维度全面分析代码：
- 编码规范和代码风格
- 潜在的 Bug 和逻辑错误
- 性能问题和优化建议
- 安全漏洞和风险
- 可维护性和可读性
- 最佳实践和设计模式

输出格式必须严格符合以下 JSON Schema：

${schema}

注意：
- title: 问题的简短标题（中文）
- description: 详细描述问题（中文）
- suggestion: 具体的修复建议（中文）
- line: 问题所在的行号（从1开始计数，必须准确对应代码中的行号）
- column: 问题所在的列号（从1开始计数，指向问题代码的起始位置）
- code_snippet: 包含问题的代码片段（建议包含问题行及其前后1-2行作为上下文，保持原始缩进格式）
- ai_explanation: AI 的深入解释（中文）
- xai.what: 这是什么问题（中文）
- xai.why: 为什么会有这个问题（中文）
- xai.how: 如何修复这个问题（中文）

【重要】关于行号和代码片段：
1. line 必须是问题代码的行号！！！代码左侧有"行号|"标注，例如"25| const x = 1"表示第25行，line字段必须填25
2. column 是问题代码在该行中的起始列位置（从1开始，不包括"行号|"前缀部分）
3. code_snippet 应该包含问题代码及其上下文（前后各1-2行），去掉"行号|"前缀，保持原始代码的缩进
4. 如果代码片段包含多行，必须使用 \\n 表示换行符（这是JSON的要求）
5. 如果无法确定准确的行号，不要填写line和column字段（不要填0）

【严格禁止】：
- 禁止在任何字段中使用英文，所有内容必须是简体中文
- 禁止在JSON字符串值中使用真实换行符，必须用\\n转义
- 禁止输出markdown代码块标记（如\`\`\`json）

示例（假设代码中第25行是 "25| config[password] = user_password"）：
{
  "issues": [{
    "type": "security",
    "severity": "high",
    "title": "密码明文存储",
    "description": "密码以明文形式存储在配置文件中",
    "suggestion": "使用加密算法对密码进行加密存储",
    "line": 25,
    "column": 5,
    "code_snippet": "config[password] = user_password\\nconfig.save()",
    "ai_explanation": "明文存储密码存在安全风险",
    "xai": {
      "what": "密码未加密直接存储",
      "why": "容易被未授权访问获取",
      "how": "使用AES等加密算法加密后再存储"
    }
  }],
  "quality_score": 75,
  "summary": {"total_issues": 1, "critical_issues": 0, "high_issues": 1, "medium_issues": 0, "low_issues": 0},
  "metrics": {"complexity": 80, "maintainability": 75, "security": 70, "performance": 85}
}

⚠️ 重要提醒：line字段必须从代码左侧的行号标注中读取，不要猜测或填0！`
      : `⚠️⚠️⚠️ OUTPUT JSON ONLY! NO OTHER FORMAT! NO MARKDOWN! NO TEXT ANALYSIS! ⚠️⚠️⚠️

You are a professional code auditing assistant. Your task is to analyze code and return results in strict JSON Schema format.

【MOST IMPORTANT】Output format requirements:
1. MUST output pure JSON object only, starting with { and ending with }
2. NO text, explanation, or markdown markers before or after JSON
3. NO \`\`\`json or ### markdown syntax
4. Even for document files (like README), output analysis in JSON format

【Content requirements】:
1. All text content MUST be in English ONLY
2. Special characters in JSON strings must be properly escaped (\\n for newlines, \\" for quotes, \\\\ for backslashes)
3. code_snippet field MUST use \\n for newlines

Please comprehensively analyze the code from the following dimensions:
- Coding standards and code style
- Potential bugs and logical errors
- Performance issues and optimization suggestions
- Security vulnerabilities and risks
- Maintainability and readability
- Best practices and design patterns

The output format MUST strictly conform to the following JSON Schema:

${schema}

Note:
- title: Brief title of the issue (in English)
- description: Detailed description of the issue (in English)
- suggestion: Specific fix suggestions (in English)
- line: Line number where the issue occurs (1-indexed, must accurately correspond to the line in the code)
- column: Column number where the issue starts (1-indexed, pointing to the start position of the problematic code)
- code_snippet: Code snippet containing the issue (should include the problem line plus 1-2 lines before and after for context, preserve original indentation)
- ai_explanation: AI's in-depth explanation (in English)
- xai.what: What is this issue (in English)
- xai.why: Why does this issue exist (in English)
- xai.how: How to fix this issue (in English)

【IMPORTANT】About line numbers and code snippets:
1. 'line' MUST be the line number from code!!! Code has "lineNumber|" prefix, e.g. "25| const x = 1" means line 25, you MUST set line to 25
2. 'column' is the starting column position in that line (1-indexed, excluding the "lineNumber|" prefix)
3. 'code_snippet' should include the problematic code with context (1-2 lines before/after), remove "lineNumber|" prefix, preserve indentation
4. If code snippet has multiple lines, use \\n for newlines (JSON requirement)
5. If you cannot determine the exact line number, do NOT fill line and column fields (don't use 0)

【STRICTLY PROHIBITED】:
- NO Chinese characters in any field - English ONLY
- NO real newline characters in JSON string values - must use \\n
- NO markdown code block markers (like \`\`\`json)

Example (assuming line 25 in code is "25| config[password] = user_password"):
{
  "issues": [{
    "type": "security",
    "severity": "high",
    "title": "Plain text password storage",
    "description": "Password is stored in plain text in config file",
    "suggestion": "Use encryption algorithm to encrypt password before storage",
    "line": 25,
    "column": 5,
    "code_snippet": "config[password] = user_password\\nconfig.save()",
    "ai_explanation": "Storing passwords in plain text poses security risks",
    "xai": {
      "what": "Password stored without encryption",
      "why": "Easy to access by unauthorized users",
      "how": "Use AES or similar encryption before storing"
    }
  }],
  "quality_score": 75,
  "summary": {"total_issues": 1, "critical_issues": 0, "high_issues": 1, "medium_issues": 0, "low_issues": 0},
  "metrics": {"complexity": 80, "maintainability": 75, "security": 70, "performance": 85}
}

⚠️ CRITICAL: Read line numbers from the "lineNumber|" prefix on the left of each code line. Do NOT guess or use 0!`;

    // 为代码添加行号，帮助LLM准确定位问题
    const codeWithLineNumbers = code.split('\n').map((line, idx) => `${idx + 1}| ${line}`).join('\n');
    
    const userPrompt = isChineseOutput
      ? `编程语言: ${language}

⚠️ 代码已标注行号（格式：行号| 代码内容），请根据行号准确填写 line 字段！

请分析以下代码:

${codeWithLineNumbers}`
      : `Programming Language: ${language}

⚠️ Code is annotated with line numbers (format: lineNumber| code), please fill the 'line' field accurately based on these numbers!

Please analyze the following code:

${codeWithLineNumbers}`;

    let text = '';
    try {
      console.log('🚀 开始调用 LLM 分析...');
      console.log(`📡 提供商: ${env.LLM_PROVIDER}`);
      console.log(`🤖 模型: ${getCurrentLLMModel()}`);
      console.log(`🔗 Base URL: ${env.LLM_BASE_URL || '(默认)'}`);

      // 使用新的LLM服务进行分析
      const response = await llmService.complete({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
      });
      text = response.content;

      console.log('✅ LLM 响应成功');
      console.log(`📊 响应长度: ${text.length} 字符`);
      console.log(`📝 响应内容预览: ${text.substring(0, 200)}...`);
    } catch (e: any) {
      console.error('LLM分析失败:', e);

      // 构造更友好的错误消息
      const errorMsg = e.message || '未知错误';
      const provider = env.LLM_PROVIDER;

      // 抛出详细的错误信息给前端
      throw new Error(
        `${provider} API调用失败\n\n` +
        `错误详情：${errorMsg}\n\n` +
        `配置检查：\n` +
        `- 提供商：${provider}\n` +
        `- 模型：${getCurrentLLMModel() || '(使用默认)'}\n` +
        `- 超时设置：${env.LLM_TIMEOUT}ms\n\n` +
        `提示：建议使用后端 API 进行分析，LLM 配置由后端统一管理`
      );
    }
    const parsed = this.safeParseJson(text);

    // 如果解析失败，抛出错误而不是返回默认值
    if (!parsed) {
      const provider = env.LLM_PROVIDER;
      const currentModel = getCurrentLLMModel();

      let suggestions = '';
      if (provider === 'ollama') {
        suggestions =
          `建议解决方案：\n` +
          `1. 升级到更强的模型（推荐）：\n` +
          `   ollama pull codellama\n` +
          `   ollama pull qwen2.5:7b\n` +
          `2. 更新配置文件 .env：\n` +
          `   VITE_LLM_MODEL=codellama\n` +
          `3. 重启应用后重试\n\n` +
          `注意：超轻量模型仅适合测试连接，实际使用需要更强的模型。`;
      } else {
        suggestions =
          `建议解决方案：\n` +
          `1. 尝试更换更强大的模型（在 .env 中修改 VITE_LLM_MODEL）\n` +
          `2. 检查当前模型是否支持结构化输出（JSON 格式）\n` +
          `3. 尝试切换到其他 LLM 提供商：\n` +
          `   - Gemini (免费额度充足)\n` +
          `   - OpenAI GPT (稳定可靠)\n` +
          `   - Claude (代码理解能力强)\n` +
          `   - DeepSeek (性价比高)\n` +
          `4. 如果使用代理，检查网络连接是否稳定\n` +
          `5. 增加超时时间（VITE_LLM_TIMEOUT）`;
      }

      throw new Error(
        `LLM 响应解析失败\n\n` +
        `提供商: ${provider}\n` +
        `模型: ${currentModel || '(默认)'}\n\n` +
        `原因：当前模型返回的内容不是有效的 JSON 格式，\n` +
        `这可能是因为模型能力不足或配置不当。\n\n` +
        suggestions
      );
    }

    console.log('🔍 解析结果:', {
      hasIssues: Array.isArray(parsed?.issues),
      issuesCount: parsed?.issues?.length || 0,
      hasMetrics: !!parsed?.metrics,
      hasQualityScore: !!parsed?.quality_score
    });

    const issues = Array.isArray(parsed?.issues) ? parsed.issues : [];
    
    // 规范化issues，确保数据格式正确
    issues.forEach((issue: any, index: number) => {
      // 验证行号和列号的合理性
      if (issue.line !== undefined) {
        const originalLine = issue.line;
        const parsedLine = parseInt(issue.line);
        // 如果行号是0或无效值，设置为undefined而不是1（表示未知位置）
        if (isNaN(parsedLine) || parsedLine <= 0) {
          console.warn(`⚠️ 问题 #${index + 1} "${issue.title}" 的行号无效: ${originalLine}，已设置为 undefined`);
          issue.line = undefined;
        } else {
          issue.line = parsedLine;
        }
      }
      
      if (issue.column !== undefined) {
        const originalColumn = issue.column;
        const parsedColumn = parseInt(issue.column);
        // 如果列号是0或无效值，设置为undefined而不是1
        if (isNaN(parsedColumn) || parsedColumn <= 0) {
          console.warn(`⚠️ 问题 #${index + 1} "${issue.title}" 的列号无效: ${originalColumn}，已设置为 undefined`);
          issue.column = undefined;
        } else {
          issue.column = parsedColumn;
        }
      }
      
      // 确保所有文本字段都存在且是字符串类型
      const textFields = ['title', 'description', 'suggestion', 'ai_explanation'];
      textFields.forEach(field => {
        if (issue[field] && typeof issue[field] !== 'string') {
          issue[field] = String(issue[field]);
        }
      });
      
      // code_snippet已经由JSON.parse正确处理，不需要额外处理
      // JSON.parse会自动将\\n转换为真实的换行符，这正是我们想要的
    });
    
    const metrics = parsed?.metrics ?? this.estimateMetricsFromIssues(issues);
    const qualityScore = parsed?.quality_score ?? this.calculateQualityScore(metrics, issues);

    console.log(`📋 最终发现 ${issues.length} 个问题`);
    console.log(`⭐ 质量评分: ${qualityScore}`);

    return {
      issues,
      quality_score: qualityScore,
      summary: parsed?.summary ?? {
        total_issues: issues.length,
        critical_issues: issues.filter((i: any) => i.severity === 'critical').length,
        high_issues: issues.filter((i: any) => i.severity === 'high').length,
        medium_issues: issues.filter((i: any) => i.severity === 'medium').length,
        low_issues: issues.filter((i: any) => i.severity === 'low').length,
      },
      metrics
    } as CodeAnalysisResult;
  }

  private static safeParseJson(text: string): any {
    // 预处理：修复常见的非标准 JSON 格式
    const fixJsonFormat = (str: string): string => {
      // 1. 去除前后空白
      str = str.trim();

      // 2. 修复尾部逗号（JSON 不允许）- 必须在其他处理之前
      str = str.replace(/,(\s*[}\]])/g, '$1');

      // 3. 修复缺少逗号的问题
      str = str.replace(/\}(\s*)\{/g, '},\n{');
      str = str.replace(/\](\s*)\[/g, '],\n[');
      str = str.replace(/\}(\s*)"([^"]+)":/g, '},\n"$2":');
      str = str.replace(/\](\s*)"([^"]+)":/g, '],\n"$2":');

      // 4. 修复对象/数组后缺少逗号的情况
      str = str.replace(/([}\]])(\s*)(")/g, '$1,\n$3');

      // 5. 移除多余的逗号
      str = str.replace(/,+/g, ',');

      return str;
    };

    // 清理和修复 JSON 字符串
    const cleanText = (str: string): string => {
      // 移除 BOM 和零宽字符
      let cleaned = str
        .replace(/^\uFEFF/, '')
        .replace(/[\u200B-\u200D\uFEFF]/g, '');

      // 使用状态机智能处理JSON字符串值中的控制字符
      // 这种方法可以正确处理包含换行符、引号等特殊字符的多行字符串
      let result = '';
      let inString = false;
      let isKey = false;  // 是否在处理键名
      let prevChar = '';
      
      for (let i = 0; i < cleaned.length; i++) {
        const char = cleaned[i];
        const nextChar = cleaned[i + 1] || '';
        
        // 检测字符串的开始和结束（检查前一个字符不是未转义的反斜杠）
        if (char === '"' && prevChar !== '\\') {
          if (!inString) {
            // 字符串开始 - 判断是键还是值
            // 简单判断：如果前面有冒号，则是值，否则是键
            const beforeQuote = result.slice(Math.max(0, result.length - 10));
            isKey = !beforeQuote.includes(':') || beforeQuote.lastIndexOf(':') < beforeQuote.lastIndexOf('{') || beforeQuote.lastIndexOf(':') < beforeQuote.lastIndexOf(',');
          }
          inString = !inString;
          result += char;
          prevChar = char;
          continue;
        }
        
        // 在字符串值内部（非键名）处理特殊字符
        if (inString && !isKey) {
          const code = char.charCodeAt(0);
          
          // 转义控制字符
          if (code === 0x0A) {  // 换行符
            result += '\\n';
            prevChar = 'n';  // 防止被识别为转义符
            continue;
          } else if (code === 0x0D) {  // 回车符
            result += '\\r';
            prevChar = 'r';
            continue;
          } else if (code === 0x09) {  // 制表符
            result += '\\t';
            prevChar = 't';
            continue;
          } else if (code < 0x20 || (code >= 0x7F && code <= 0x9F)) {
            // 其他控制字符：移除
            prevChar = char;
            continue;
          }
          
          // 处理反斜杠
          if (char === '\\' && nextChar && '"\\/bfnrtu'.indexOf(nextChar) === -1) {
            // 无效的转义序列，转义反斜杠本身
            result += '\\\\';
            prevChar = '\\';
            continue;
          }
          
          // 移除中文引号（使用Unicode编码避免语法错误）
          const charCode = char.charCodeAt(0);
          if (charCode === 0x201C || charCode === 0x201D || charCode === 0x2018 || charCode === 0x2019) {
            prevChar = char;
            continue;
          }
        }
        
        // 默认情况：保持字符不变
        result += char;
        prevChar = char;
      }

      return result;
    };

    // 尝试多种方式解析
    const attempts = [
      // 1. 直接解析原始响应（如果LLM输出格式完美）
      () => {
        return JSON.parse(text);
      },
      // 2. 清理后再解析
      () => {
        const cleaned = cleanText(text);
        const fixed = fixJsonFormat(cleaned);
        return JSON.parse(fixed);
      },
      // 3. 提取 JSON 对象（智能匹配，处理字符串中的花括号）
      () => {
        const cleaned = cleanText(text);
        // 找到第一个 { 的位置
        const startIdx = cleaned.indexOf('{');
        if (startIdx === -1) throw new Error('No JSON object found');

        // 从第一个 { 开始，找到匹配的 }，需要考虑字符串中的引号
        let braceCount = 0;
        let endIdx = -1;
        let inString = false;
        let prevChar = '';
        
        for (let i = startIdx; i < cleaned.length; i++) {
          const char = cleaned[i];
          
          // 检测字符串边界（排除转义的引号）
          if (char === '"' && prevChar !== '\\') {
            inString = !inString;
          }
          
          // 只在字符串外部统计花括号
          if (!inString) {
            if (char === '{') braceCount++;
            if (char === '}') {
              braceCount--;
              if (braceCount === 0) {
                endIdx = i + 1;
                break;
              }
            }
          }
          
          prevChar = char;
        }

        if (endIdx === -1) throw new Error('Incomplete JSON object');

        const jsonStr = cleaned.substring(startIdx, endIdx);
        const fixed = fixJsonFormat(jsonStr);
        return JSON.parse(fixed);
      },
      // 4. 去除 markdown 代码块
      () => {
        const cleaned = cleanText(text);
        const codeBlockMatch = cleaned.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
        if (codeBlockMatch) {
          const fixed = fixJsonFormat(codeBlockMatch[1]);
          return JSON.parse(fixed);
        }
        throw new Error('No code block found');
      },
      // 5. 尝试修复截断的 JSON
      () => {
        const cleaned = cleanText(text);
        const startIdx = cleaned.indexOf('{');
        if (startIdx === -1) throw new Error('Cannot fix truncated JSON');

        let json = cleaned.substring(startIdx);
        // 尝试补全未闭合的结构
        const openBraces = (json.match(/\{/g) || []).length;
        const closeBraces = (json.match(/\}/g) || []).length;
        const openBrackets = (json.match(/\[/g) || []).length;
        const closeBrackets = (json.match(/\]/g) || []).length;

        // 补全缺失的闭合符号
        json += ']'.repeat(Math.max(0, openBrackets - closeBrackets));
        json += '}'.repeat(Math.max(0, openBraces - closeBraces));

        const fixed = fixJsonFormat(json);
        return JSON.parse(fixed);
      }
    ];

    let lastError: any = null;
    for (let i = 0; i < attempts.length; i++) {
      try {
        const result = attempts[i]();
        if (i > 0) {
          console.log(`✅ JSON解析成功（方法 ${i + 1}/${attempts.length}）`);
        }
        return result;
      } catch (e) {
        lastError = e;
        if (i === 0) {
          console.warn('直接解析失败，尝试清理后解析...', e);
        } else if (i === 2) {
          console.warn('提取 JSON 对象后解析失败:', e);
        } else if (i === 3) {
          console.warn('从代码块提取 JSON 失败:', e);
        }
      }
    }

    // 所有尝试都失败
    console.error('⚠️ 无法解析 LLM 响应为 JSON');
    console.error('原始内容（前500字符）:', text.substring(0, 500));
    console.error('解析错误:', lastError);
    console.warn('💡 提示: 当前模型可能无法生成有效的 JSON 格式');
    console.warn('   建议：更换更强大的模型或切换其他 LLM 提供商');
    return null;
  }

  private static estimateMetricsFromIssues(issues: any[]) {
    const base = 90;
    const penalty = Math.min(60, (issues?.length || 0) * 2);
    const score = Math.max(0, base - penalty);
    return {
      complexity: score,
      maintainability: score,
      security: score,
      performance: score
    };
  }

  private static calculateQualityScore(metrics: any, issues: any[]): number {
    const criticalWeight = 30;
    const highWeight = 20;
    const mediumWeight = 10;
    const lowWeight = 5;

    const criticalIssues = issues.filter((i: any) => i.severity === 'critical').length;
    const highIssues = issues.filter((i: any) => i.severity === 'high').length;
    const mediumIssues = issues.filter((i: any) => i.severity === 'medium').length;
    const lowIssues = issues.filter((i: any) => i.severity === 'low').length;

    const issueScore = 100 - (
      criticalIssues * criticalWeight +
      highIssues * highWeight +
      mediumIssues * mediumWeight +
      lowIssues * lowWeight
    );

    const metricsScore = (
      metrics.complexity +
      metrics.maintainability +
      metrics.security +
      metrics.performance
    ) / 4;

    return Math.max(0, Math.min(100, (issueScore + metricsScore) / 2));
  }

  // 仓库级别的分析（占位保留）
  static async analyzeRepository(_repoUrl: string, _branch: string = 'main', _excludePatterns: string[] = []): Promise<{
    taskId: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
  }> {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    return { taskId, status: 'pending' };
  }

  // GitHub/GitLab集成（占位保留）
  static async getRepositories(_token: string, _platform: 'github' | 'gitlab'): Promise<any[]> {
    return [
      {
        id: '1',
        name: 'example-project',
        full_name: 'user/example-project',
        description: '示例项目',
        html_url: 'https://github.com/user/example-project',
        clone_url: 'https://github.com/user/example-project.git',
        default_branch: 'main',
        language: 'JavaScript',
        private: false,
        updated_at: new Date().toISOString()
      }
    ];
  }

  static async getBranches(_repoUrl: string, _token: string): Promise<any[]> {
    return [
      {
        name: 'main',
        commit: {
          sha: 'abc123',
          url: 'https://github.com/user/repo/commit/abc123'
        },
        protected: true
      },
      {
        name: 'develop',
        commit: {
          sha: 'def456',
          url: 'https://github.com/user/repo/commit/def456'
        },
        protected: false
      }
    ];
  }
}