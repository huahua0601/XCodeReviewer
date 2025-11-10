import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Code,
  FileText,
  Info,
  Lightbulb,
  Shield,
  Target,
  TrendingUp,
  Upload,
  Zap,
  X,
  Download
} from "lucide-react";
import { api } from "@/shared/services/unified-api";
import { apiClient } from "@/shared/services/api/client";
import type { CodeAnalysisResult, AuditTask, AuditIssue } from "@/shared/types";
import { toast } from "sonner";
import ExportReportDialog from "@/components/reports/ExportReportDialog";
import { SUPPORTED_LANGUAGES } from "@/shared/constants";

// AI解释解析函数
function parseAIExplanation(aiExplanation: string) {
  try {
    const parsed = JSON.parse(aiExplanation);
    // 检查是否有xai字段
    if (parsed.xai) {
      return parsed.xai;
    }
    // 检查是否直接包含what, why, how字段
    if (parsed.what || parsed.why || parsed.how) {
      return parsed;
    }
    // 如果都没有，返回null表示无法解析
    return null;
  } catch (error) {
    // JSON解析失败，返回null
    return null;
  }
}

export default function InstantAnalysis() {
  const user = null as any;
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<CodeAnalysisResult | null>(null);
  const [analysisTime, setAnalysisTime] = useState(0);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [llmProviders, setLlmProviders] = useState<any[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<number | undefined>(undefined);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadingCardRef = useRef<HTMLDivElement>(null);

  const supportedLanguages = SUPPORTED_LANGUAGES;

  // 加载 LLM Providers
  useEffect(() => {
    const loadLLMProviders = async () => {
      try {
        setLoadingProviders(true);
        const response = await apiClient.get('/llm-providers?page_size=100&is_active=true');
        setLlmProviders(response.items || []);
      } catch (error) {
        console.error('Failed to load LLM providers:', error);
        // 静默失败，不影响用户使用
      } finally {
        setLoadingProviders(false);
      }
    };

    loadLLMProviders();
  }, []);

  // 监听analyzing状态变化，自动滚动到加载卡片
  useEffect(() => {
    if (analyzing && loadingCardRef.current) {
      // 使用requestAnimationFrame确保DOM更新完成后再滚动
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (loadingCardRef.current) {
            loadingCardRef.current.scrollIntoView({
              behavior: 'smooth',
              block: 'center'
            });
          }
        }, 50);
      });
    }
  }, [analyzing]);

  // 示例代码
  const exampleCodes = {
    javascript: `// 示例JavaScript代码 - 包含多种问题
var userName = "admin";
var password = "123456"; // 硬编码密码

function validateUser(input) {
    if (input == userName) { // 使用 == 比较
        console.log("User validated"); // 生产代码中的console.log
        return true;
    }
    return false;
}

// 性能问题：循环中重复计算长度
function processItems(items) {
    for (var i = 0; i < items.length; i++) {
        for (var j = 0; j < items.length; j++) {
            console.log(items[i] + items[j]);
        }
    }
}

// 安全问题：使用eval
function executeCode(userInput) {
    eval(userInput); // 危险的eval使用
}`,
    python: `# 示例Python代码 - 包含多种问题
import *  # 通配符导入

password = "secret123"  # 硬编码密码

def process_data(data):
    try:
        result = []
        for item in data:
            print(item)  # 使用print而非logging
            result.append(item * 2)
        return result
    except:  # 裸露的except语句
        pass

def complex_function():
    # 函数过长示例
    if True:
        if True:
            if True:
                if True:
                    if True:  # 嵌套过深
                        print("Deep nesting")`,
    java: `// 示例Java代码 - 包含多种问题
public class Example {
    private String password = "admin123"; // 硬编码密码
    
    public void processData() {
        System.out.println("Processing..."); // 使用System.out.print
        
        try {
            // 一些处理逻辑
            String data = getData();
        } catch (Exception e) {
            // 空的异常处理
        }
    }
    
    private String getData() {
        return "data";
    }
}`,
    swift: `// 示例Swift代码 - 包含多种问题
import Foundation

class UserManager {
    var password = "admin123" // 硬编码密码
    
    func validateUser(input: String) -> Bool {
        if input == password { // 直接比较密码
            print("User validated") // 使用print而非日志
            return true
        }
        return false
    }
    
    // 强制解包可能导致崩溃
    func processData(data: [String]?) {
        let items = data! // 强制解包
        for item in items {
            print(item)
        }
    }
    
    // 内存泄漏风险：循环引用
    var closure: (() -> Void)?
    func setupClosure() {
        closure = {
            print(self.password) // 未使用 [weak self]
        }
    }
}`,
    kotlin: `// 示例Kotlin代码 - 包含多种问题
class UserManager {
    private val password = "admin123" // 硬编码密码
    
    fun validateUser(input: String): Boolean {
        if (input == password) { // 直接比较密码
            println("User validated") // 使用println而非日志
            return true
        }
        return false
    }
    
    // 空指针风险
    fun processData(data: List<String>?) {
        val items = data!! // 强制非空断言
        for (item in items) {
            println(item)
        }
    }
    
    // 性能问题：循环中重复计算
    fun inefficientLoop(items: List<String>) {
        for (i in 0 until items.size) {
            for (j in 0 until items.size) { // O(n²) 复杂度
                println(items[i] + items[j])
            }
        }
    }
}`
  };

  const handleAnalyze = async () => {
    if (!code.trim()) {
      toast.error("请输入要分析的代码");
      return;
    }
    if (!language) {
      toast.error("请选择编程语言");
      return;
    }

    try {
      setAnalyzing(true);

      // 立即滚动到页面底部（加载卡片会出现的位置）
      setTimeout(() => {
        window.scrollTo({
          top: document.body.scrollHeight,
          behavior: 'smooth'
        });
      }, 100);

      const startTime = Date.now();

      // 使用后端 API 进行代码分析（LLM 配置由后端统一管理）
      console.log('🔄 使用后端API进行即时代码分析', { 
        provider_id: selectedProviderId,
        provider_name: selectedProviderId ? llmProviders.find(p => p.id === selectedProviderId)?.display_name : '系统默认'
      });
      const analysisResult = await api.analyzeInstantCode(code, language, selectedProviderId);
      
      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;

      setResult(analysisResult);
      setAnalysisTime(duration);

      // 保存分析记录（可选，未登录时跳过）
      if (user) {
        await api.createInstantAnalysis({
          user_id: user.id,
          language,
          // 不存储代码内容，仅存储摘要
          code_content: '',
          analysis_result: JSON.stringify(analysisResult),
          issues_count: analysisResult.issues.length,
          quality_score: analysisResult.quality_score,
          analysis_time: duration
        });
      }

      toast.success(`分析完成！发现 ${analysisResult.issues.length} 个问题`);
    } catch (error: any) {
      console.error('Analysis failed:', error);
      const errorMsg = error?.response?.data?.detail || error?.message || "分析失败，请稍后重试";
      toast.error(errorMsg);
    } finally {
      setAnalyzing(false);
      // 即时分析结束后清空前端内存中的代码（满足NFR-2销毁要求）
      setCode("");
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setCode(content);

      // 根据文件扩展名自动选择语言
      const extension = file.name.split('.').pop()?.toLowerCase();
      const languageMap: Record<string, string> = {
        'js': 'javascript',
        'jsx': 'javascript',
        'ts': 'typescript',
        'tsx': 'typescript',
        'py': 'python',
        'java': 'java',
        'go': 'go',
        'rs': 'rust',
        'cpp': 'cpp',
        'c': 'cpp',
        'cc': 'cpp',
        'h': 'cpp',
        'hh': 'cpp',
        'cs': 'csharp',
        'php': 'php',
        'rb': 'ruby',
        'swift': 'swift',
        'kt': 'kotlin'
      };

      if (extension && languageMap[extension]) {
        setLanguage(languageMap[extension]);
      }
    };
    reader.readAsText(file);
  };

  const loadExampleCode = (lang: string) => {
    const example = exampleCodes[lang as keyof typeof exampleCodes];
    if (example) {
      setCode(example);
      setLanguage(lang);
      toast.success(`已加载${lang}示例代码`);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-red-50 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'security': return <Shield className="w-4 h-4" />;
      case 'bug': return <AlertTriangle className="w-4 h-4" />;
      case 'performance': return <Zap className="w-4 h-4" />;
      case 'style': return <Code className="w-4 h-4" />;
      case 'maintainability': return <FileText className="w-4 h-4" />;
      default: return <Info className="w-4 h-4" />;
    }
  };

  const clearAnalysis = () => {
    setCode("");
    setLanguage("");
    setResult(null);
    setAnalysisTime(0);
  };

  // 构造临时任务和问题数据用于导出
  const getTempTaskAndIssues = () => {
    if (!result) return null;

    const tempTask: AuditTask = {
      id: 'instant-' + Date.now(),
      project_id: 'instant-analysis',
      task_type: 'instant',
      status: 'completed',
      branch_name: undefined,
      exclude_patterns: '[]',
      scan_config: JSON.stringify({ language }),
      total_files: 1,
      scanned_files: 1,
      total_lines: code.split('\n').length,
      issues_count: result.issues.length,
      quality_score: result.quality_score,
      started_at: undefined,
      completed_at: new Date().toISOString(),
      created_by: 'local-user',
      created_at: new Date().toISOString(),
      project: {
        id: 'instant',
        owner_id: 'local-user',
        name: '即时分析',
        description: `${language} 代码即时分析`,
        repository_type: 'other',
        repository_url: undefined,
        default_branch: 'instant',
        programming_languages: JSON.stringify([language]),
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    };

    const tempIssues: AuditIssue[] = result.issues.map((issue, index) => ({
      id: `instant-issue-${index}`,
      task_id: tempTask.id,
      file_path: `instant-analysis.${language}`,
      line_number: issue.line || undefined,
      column_number: issue.column || undefined,
      issue_type: issue.type as any,
      severity: issue.severity as any,
      title: issue.title,
      description: issue.description || undefined,
      suggestion: issue.suggestion || undefined,
      fix_example: issue.fix_example || undefined,
      code_snippet: issue.code_snippet || undefined,
      ai_explanation: issue.ai_explanation || (issue.xai ? JSON.stringify(issue.xai) : undefined),
      status: 'open',
      resolved_by: undefined,
      resolved_at: undefined,
      created_at: new Date().toISOString()
    }));

    return { task: tempTask, issues: tempIssues };
  };

  // 渲染问题的函数，使用紧凑样式
  const renderIssue = (issue: any, index: number) => (
    <div key={index} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-gray-300 transition-all duration-200 group">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start space-x-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${issue.severity === 'critical' ? 'bg-red-100 text-red-600' :
            issue.severity === 'high' ? 'bg-orange-100 text-orange-600' :
              issue.severity === 'medium' ? 'bg-yellow-100 text-yellow-600' :
                'bg-blue-100 text-blue-600'
            }`}>
            {getTypeIcon(issue.type)}
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-base text-gray-900 mb-1 group-hover:text-gray-700 transition-colors">{issue.title}</h4>
            <div className="flex items-center space-x-1 text-xs text-gray-600">
              <span>📍</span>
              <span>第 {issue.line} 行</span>
              {issue.column && <span>，第 {issue.column} 列</span>}
            </div>
          </div>
        </div>
        <Badge className={`${getSeverityColor(issue.severity)} px-2 py-1 text-xs font-medium`}>
          {issue.severity === 'critical' ? '严重' :
            issue.severity === 'high' ? '高' :
              issue.severity === 'medium' ? '中等' : '低'}
        </Badge>
      </div>

      {/* 只有当description和title不同时才显示description */}
      {issue.description && issue.description !== issue.title && (
        <div className="bg-white border border-gray-200 rounded-lg p-3 mb-3">
          <div className="flex items-center mb-1">
            <Info className="w-3 h-3 text-gray-600 mr-1" />
            <span className="font-medium text-gray-800 text-xs">问题详情</span>
          </div>
          <p className="text-gray-700 text-xs leading-relaxed">
            {issue.description}
          </p>
        </div>
      )}

      {issue.code_snippet && (
        <div className="bg-gray-900 rounded-lg p-3 mb-3 border border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-1">
              <div className="w-4 h-4 bg-red-600 rounded flex items-center justify-center">
                <Code className="w-2 h-2 text-white" />
              </div>
              <span className="text-gray-300 text-xs font-medium">问题代码</span>
            </div>
            <span className="text-gray-400 text-xs">第 {issue.line} 行</span>
          </div>
          <div className="bg-black/40 rounded p-2">
            <pre className="text-xs text-gray-100 overflow-x-auto">
              <code>{issue.code_snippet}</code>
            </pre>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {issue.suggestion && (() => {
          // 判断是否为代码内容 (包含换行符、多个空格、或特定代码字符)
          const isCode = issue.suggestion.includes('\n') || 
                        issue.suggestion.includes('  ') || 
                        /[{}();=<>]/.test(issue.suggestion) ||
                        issue.suggestion.split(' ').length < 10; // 代码通常词汇较少
          
          return (
            <div className="bg-white border border-blue-200 rounded-lg p-3 shadow-sm">
              <div className="flex items-center mb-2">
                <div className="w-5 h-5 bg-blue-600 rounded flex items-center justify-center mr-2">
                  <Lightbulb className="w-3 h-3 text-white" />
                </div>
                <span className="font-medium text-blue-800 text-sm">修复建议</span>
              </div>
              {isCode ? (
                <pre className="bg-blue-50 border border-blue-200 rounded p-2 overflow-x-auto">
                  <code className="text-xs text-blue-900 font-mono whitespace-pre">{issue.suggestion}</code>
                </pre>
              ) : (
                <p className="text-blue-700 text-xs leading-relaxed">{issue.suggestion}</p>
              )}
            </div>
          );
        })()}

        {issue.fix_example && issue.fix_example.trim() && (
          <div className="bg-white border border-green-200 rounded-lg p-3 shadow-sm">
            <div className="flex items-center mb-2">
              <div className="w-5 h-5 bg-green-600 rounded flex items-center justify-center mr-2">
                <Code className="w-3 h-3 text-white" />
              </div>
              <span className="font-medium text-green-800 text-sm">修复示例代码</span>
            </div>
            <pre className="bg-gray-50 border border-gray-200 rounded p-2 overflow-x-auto">
              <code className="text-xs text-gray-800 font-mono whitespace-pre">{issue.fix_example}</code>
            </pre>
          </div>
        )}

        {issue.ai_explanation && (() => {
          const parsedExplanation = parseAIExplanation(issue.ai_explanation);

          if (parsedExplanation) {
            return (
              <div className="bg-white border border-red-200 rounded-lg p-3 shadow-sm">
                <div className="flex items-center mb-2">
                  <div className="w-5 h-5 bg-red-600 rounded flex items-center justify-center mr-2">
                    <Zap className="w-3 h-3 text-white" />
                  </div>
                  <span className="font-medium text-red-800 text-sm">AI 解释</span>
                </div>

                <div className="space-y-2 text-xs">
                  {parsedExplanation.what && (
                    <div className="border-l-2 border-red-600 pl-2">
                      <span className="font-medium text-red-700">问题：</span>
                      <span className="text-gray-700 ml-1">{parsedExplanation.what}</span>
                    </div>
                  )}

                  {parsedExplanation.why && (
                    <div className="border-l-2 border-gray-600 pl-2">
                      <span className="font-medium text-gray-700">原因：</span>
                      <span className="text-gray-700 ml-1">{parsedExplanation.why}</span>
                    </div>
                  )}

                  {parsedExplanation.how && (
                    <div className="border-l-2 border-black pl-2">
                      <span className="font-medium text-black">方案：</span>
                      <span className="text-gray-700 ml-1">{parsedExplanation.how}</span>
                    </div>
                  )}

                  {parsedExplanation.learn_more && (
                    <div className="border-l-2 border-red-400 pl-2">
                      <span className="font-medium text-red-600">链接：</span>
                      <a
                        href={parsedExplanation.learn_more}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-red-600 hover:text-red-800 hover:underline ml-1"
                      >
                        {parsedExplanation.learn_more}
                      </a>
                    </div>
                  )}
                </div>
              </div>
            );
          } else {
            // 如果无法解析JSON，回退到原始显示方式
            return (
              <div className="bg-white border border-red-200 rounded-lg p-3">
                <div className="flex items-center mb-2">
                  <Zap className="w-4 h-4 text-red-600 mr-2" />
                  <span className="font-medium text-red-800 text-sm">AI 解释</span>
                </div>
                <p className="text-gray-700 text-xs leading-relaxed">{issue.ai_explanation}</p>
              </div>
            );
          }
        })()}
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 页面标题 */}
      <div>
        <h1 className="page-title">即时代码分析</h1>
        <p className="page-subtitle">快速分析代码片段，发现潜在问题并获得修复建议</p>
      </div>

      {/* 代码输入区域 */}
      <Card className="card-modern">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">代码分析</CardTitle>
            {result && (
              <Button variant="outline" onClick={clearAnalysis} size="sm">
                <X className="w-4 h-4 mr-2" />
                重新分析
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* 工具栏 */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="选择编程语言" />
                </SelectTrigger>
                <SelectContent>
                  {supportedLanguages.map((lang) => (
                    <SelectItem key={lang} value={lang}>
                      {lang.charAt(0).toUpperCase() + lang.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Select 
                value={selectedProviderId?.toString() || "default"} 
                onValueChange={(value) => setSelectedProviderId(value === "default" ? undefined : parseInt(value))}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="选择 LLM 提供商" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">
                    <div className="flex items-center space-x-2">
                      <Zap className="w-4 h-4" />
                      <span>系统默认</span>
                    </div>
                  </SelectItem>
                  {loadingProviders ? (
                    <SelectItem value="loading" disabled>
                      <span className="text-muted-foreground">加载中...</span>
                    </SelectItem>
                  ) : (
                    llmProviders.map((provider) => (
                      <SelectItem key={provider.id} value={provider.id.toString()}>
                        <div className="flex items-center space-x-2">
                          {provider.icon && <span>{provider.icon}</span>}
                          <span>{provider.display_name}</span>
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={analyzing}
              size="sm"
            >
              <Upload className="w-3 h-3 mr-1" />
              上传文件
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".js,.jsx,.ts,.tsx,.py,.java,.go,.rs,.cpp,.c,.cc,.h,.hh,.cs,.php,.rb,.swift,.kt"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>

          {/* 快速示例 */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-gray-600">示例：</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadExampleCode('javascript')}
              disabled={analyzing}
              className="h-7 px-2 text-xs"
            >
              JavaScript
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadExampleCode('python')}
              disabled={analyzing}
              className="h-7 px-2 text-xs"
            >
              Python
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadExampleCode('java')}
              disabled={analyzing}
              className="h-7 px-2 text-xs"
            >
              Java
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadExampleCode('swift')}
              disabled={analyzing}
              className="h-7 px-2 text-xs"
            >
              Swift
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadExampleCode('kotlin')}
              disabled={analyzing}
              className="h-7 px-2 text-xs"
            >
              Kotlin
            </Button>
          </div>

          {/* 代码编辑器 */}
          <div>
            <Textarea
              placeholder="粘贴代码或上传文件..."
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="min-h-[250px] font-mono text-sm"
              disabled={analyzing}
            />
            <div className="text-xs text-gray-500 mt-1">
              {code.length} 字符，{code.split('\n').length} 行
            </div>
          </div>

          {/* 分析按钮 */}
          <Button
            onClick={handleAnalyze}
            disabled={!code.trim() || !language || analyzing}
            className="w-full btn-primary"
          >
            {analyzing ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                分析中...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 mr-2" />
                开始分析
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* 分析结果区域 */}
      {result && (
        <div className="space-y-4">
          {/* 结果概览 */}
          <Card className="card-modern">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center text-base">
                  <CheckCircle className="w-5 h-5 mr-2 text-green-600" />
                  分析结果
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    <Clock className="w-3 h-3 mr-1" />
                    {(analysisTime || 0).toFixed(2)}s
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {language.charAt(0).toUpperCase() + language.slice(1)}
                  </Badge>

                  {/* 导出按钮 */}
                  <Button
                    size="sm"
                    onClick={() => setExportDialogOpen(true)}
                    className="btn-primary"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    导出报告
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* 核心指标 */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="text-center p-4 bg-white rounded-lg border border-red-200">
                  <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center mx-auto mb-3">
                    <Target className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-2xl font-bold text-primary mb-1">
                    {(result.quality_score || 0).toFixed(1)}
                  </div>
                  <p className="text-xs font-medium text-primary/80 mb-2">质量评分</p>
                  <Progress value={result.quality_score || 0} className="h-1" />
                </div>

                <div className="text-center p-4 bg-white rounded-lg border border-red-200">
                  <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center mx-auto mb-3">
                    <AlertTriangle className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-2xl font-bold text-red-600 mb-1">
                    {result.summary.critical_issues + result.summary.high_issues}
                  </div>
                  <p className="text-xs font-medium text-red-700 mb-1">严重问题</p>
                  <div className="text-xs text-red-600">需要立即处理</div>
                </div>

                <div className="text-center p-4 bg-white rounded-lg border border-yellow-200">
                  <div className="w-12 h-12 bg-yellow-600 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Info className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-2xl font-bold text-yellow-600 mb-1">
                    {result.summary.medium_issues + result.summary.low_issues}
                  </div>
                  <p className="text-xs font-medium text-yellow-700 mb-1">一般问题</p>
                  <div className="text-xs text-yellow-600">建议优化</div>
                </div>

                <div className="text-center p-4 bg-white rounded-lg border border-green-200">
                  <div className="w-12 h-12 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-3">
                    <FileText className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-2xl font-bold text-green-600 mb-1">
                    {result.issues.length}
                  </div>
                  <p className="text-xs font-medium text-green-700 mb-1">总问题数</p>
                  <div className="text-xs text-green-600">已全部识别</div>
                </div>
              </div>

              {/* 详细指标 */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center">
                  <TrendingUp className="w-4 h-4 mr-1" />
                  详细指标
                </h3>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-lg font-bold text-gray-900 mb-1">{result.metrics.complexity}</div>
                    <p className="text-xs text-gray-600 mb-2">复杂度</p>
                    <Progress value={result.metrics.complexity} className="h-1" />
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-gray-900 mb-1">{result.metrics.maintainability}</div>
                    <p className="text-xs text-gray-600 mb-2">可维护性</p>
                    <Progress value={result.metrics.maintainability} className="h-1" />
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-gray-900 mb-1">{result.metrics.security}</div>
                    <p className="text-xs text-gray-600 mb-2">安全性</p>
                    <Progress value={result.metrics.security} className="h-1" />
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-gray-900 mb-1">{result.metrics.performance}</div>
                    <p className="text-xs text-gray-600 mb-2">性能</p>
                    <Progress value={result.metrics.performance} className="h-1" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 问题详情 */}
          <Card className="card-modern">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center text-base">
                <Shield className="w-5 h-5 mr-2 text-orange-600" />
                发现的问题 ({result.issues.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {result.issues.length > 0 ? (
                <Tabs defaultValue="all" className="w-full">
                  <TabsList className="grid w-full grid-cols-4 mb-4">
                    <TabsTrigger value="all" className="text-xs">
                      全部 ({result.issues.length})
                    </TabsTrigger>
                    <TabsTrigger value="critical" className="text-xs">
                      严重 ({result.issues.filter(i => i.severity === 'critical').length})
                    </TabsTrigger>
                    <TabsTrigger value="high" className="text-xs">
                      高 ({result.issues.filter(i => i.severity === 'high').length})
                    </TabsTrigger>
                    <TabsTrigger value="medium" className="text-xs">
                      中等 ({result.issues.filter(i => i.severity === 'medium').length})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="all" className="space-y-3 mt-4">
                    {result.issues.map((issue, index) => renderIssue(issue, index))}
                  </TabsContent>

                  {['critical', 'high', 'medium'].map(severity => (
                    <TabsContent key={severity} value={severity} className="space-y-3 mt-4">
                      {result.issues.filter(issue => issue.severity === severity).length > 0 ? (
                        result.issues.filter(issue => issue.severity === severity).map((issue, index) => renderIssue(issue, index))
                      ) : (
                        <div className="text-center py-12">
                          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                          <h3 className="text-lg font-medium text-gray-900 mb-2">
                            没有发现{severity === 'critical' ? '严重' : severity === 'high' ? '高优先级' : '中等优先级'}问题
                          </h3>
                          <p className="text-gray-500">
                            代码在此级别的检查中表现良好
                          </p>
                        </div>
                      )}
                    </TabsContent>
                  ))}
                </Tabs>


              ) : (
                <div className="text-center py-16">
                  <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <CheckCircle className="w-12 h-12 text-green-600" />
                  </div>
                  <h3 className="text-2xl font-bold text-green-800 mb-3">代码质量优秀！</h3>
                  <p className="text-green-600 text-lg mb-6">恭喜！没有发现任何问题</p>
                  <div className="bg-green-50 rounded-lg p-6 max-w-md mx-auto">
                    <p className="text-green-700 text-sm">
                      您的代码通过了所有质量检查，包括安全性、性能、可维护性等各个方面的评估。
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* 分析进行中状态 */}
      {analyzing && (
        <Card className="card-modern">
          <CardContent className="py-16">
            <div ref={loadingCardRef} className="text-center">
              <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent"></div>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">AI正在分析您的代码</h3>
              <p className="text-gray-600 text-lg mb-6">请稍候，这通常需要至少30秒钟...</p>
              <p className="text-gray-600 text-lg mb-6">分析时长取决于您的网络环境、代码长度以及使用的模型等因素</p>
              <div className="bg-red-50 rounded-lg p-6 max-w-md mx-auto">
                <p className="text-red-700 text-sm">
                  正在进行安全检测、性能分析、代码风格检查等多维度评估<br />
                  请勿离开页面！
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 导出报告对话框 */}
      {result && (() => {
        const data = getTempTaskAndIssues();
        return data ? (
          <ExportReportDialog
            open={exportDialogOpen}
            onOpenChange={setExportDialogOpen}
            task={data.task}
            issues={data.issues}
          />
        ) : null;
      })()}
    </div>
  );
}