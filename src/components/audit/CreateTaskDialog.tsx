import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  GitBranch, 
  Settings, 
  FileText, 
  AlertCircle, 
  Info,
  Zap,
  Shield,
  Search
} from "lucide-react";
import { api } from "@/shared/services/unified-api";
import { apiClient } from "@/shared/services/api/client";
import type { Project, CreateAuditTaskForm } from "@/shared/types";
import { toast } from "sonner";
import TerminalProgressDialog from "./TerminalProgressDialog";
import { createRepositoryAuditTask, createZipAuditTask } from "@/features/projects/services/taskHelper";
import { validateZipFile } from "@/features/projects/services/repoZipScan";
import { loadZipFile } from "@/shared/utils/zipStorage";

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTaskCreated: () => void;
  preselectedProjectId?: string;
  showProgressDialog?: boolean; // 是否在创建后显示进度监控窗口
}

export default function CreateTaskDialog({ open, onOpenChange, onTaskCreated, preselectedProjectId, showProgressDialog = false }: CreateTaskDialogProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showTerminalDialog, setShowTerminalDialog] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [loadingZipFile, setLoadingZipFile] = useState(false);
  const [hasLoadedZip, setHasLoadedZip] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [categoriesError, setCategoriesError] = useState(false);
  const [llmProviders, setLlmProviders] = useState<any[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  
  const [taskForm, setTaskForm] = useState<CreateAuditTaskForm>({
    project_id: "",
    task_type: "repository",
    branch_name: "main",
    llm_provider_id: undefined,
    exclude_patterns: [
      "node_modules/**", 
      ".git/**", 
      "dist/**", 
      "build/**", 
      "*.log",
      ".cache/**",
      "temp/**",
      "vendor/**",
      "coverage/**"
    ],
    scan_config: {
      include_tests: true,
      include_docs: false,
      max_file_size: 1024, // KB
      analysis_depth: "standard",
      scan_categories: [] // 添加扫描类别字段
    }
  });

  const commonExcludePatterns = [
    { label: "node_modules", value: "node_modules/**", description: "Node.js 依赖包" },
    { label: ".git", value: ".git/**", description: "Git 版本控制文件" },
    { label: "dist/build", value: "dist/**", description: "构建输出目录" },
    { label: "logs", value: "*.log", description: "日志文件" },
    { label: "cache", value: ".cache/**", description: "缓存文件" },
    { label: "temp", value: "temp/**", description: "临时文件" },
    { label: "vendor", value: "vendor/**", description: "第三方库" },
    { label: "coverage", value: "coverage/**", description: "测试覆盖率报告" }
  ];

  useEffect(() => {
    if (open) {
      loadProjects();
      loadCategories();
      loadLLMProviders();
      // 如果有预选择的项目ID，设置到表单中
      if (preselectedProjectId) {
        setTaskForm(prev => ({ ...prev, project_id: preselectedProjectId }));
      }
      // 重置ZIP文件状态
      setZipFile(null);
      setHasLoadedZip(false);
    }
  }, [open, preselectedProjectId]);

  // 当项目ID变化时，尝试自动加载保存的ZIP文件
  useEffect(() => {
    const autoLoadZipFile = async () => {
      if (!taskForm.project_id || hasLoadedZip) return;
      
      const project = projects.find(p => p.id === taskForm.project_id);
      // 检查是否是 ZIP 类型的项目
      if (!project || project.repository_type !== 'zip') return;
      
      try {
        setLoadingZipFile(true);
        const savedFile = await loadZipFile(taskForm.project_id);
        
        if (savedFile) {
          setZipFile(savedFile);
          setHasLoadedZip(true);
          console.log('✓ 已自动加载保存的ZIP文件:', savedFile.name);
          toast.success(`已加载保存的ZIP文件: ${savedFile.name}`);
        }
      } catch (error) {
        console.error('自动加载ZIP文件失败:', error);
      } finally {
        setLoadingZipFile(false);
      }
    };

    autoLoadZipFile();
  }, [taskForm.project_id, projects, hasLoadedZip]);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const data = await api.getProjects();
      setProjects(data.filter(p => p.is_active));
    } catch (error) {
      console.error('Failed to load projects:', error);
      toast.error("加载项目失败");
    } finally {
      setLoading(false);
    }
  };

  const loadLLMProviders = async () => {
    try {
      setLoadingProviders(true);
      const response = await apiClient.get('/llm-providers?page_size=100&is_active=true');
      setLlmProviders(response.items || []);
    } catch (error) {
      console.error('Failed to load LLM providers:', error);
      toast.error("加载 LLM 提供商失败");
    } finally {
      setLoadingProviders(false);
    }
  };

  const loadCategories = async () => {
    try {
      setLoadingCategories(true);
      setCategoriesError(false);
      const response = await api.prompts.getCategories();
      setCategories(response.categories || []);
      // 默认选中所有类别
      setSelectedCategories(response.categories || []);
    } catch (error) {
      console.error('Failed to load categories:', error);
      toast.error("加载扫描类别失败，请检查网络连接或稍后重试");
      setCategoriesError(true);
      setCategories([]);
      setSelectedCategories([]);
    } finally {
      setLoadingCategories(false);
    }
  };

  const handleCreateTask = async () => {
    if (!taskForm.project_id) {
      toast.error("请选择项目");
      return;
    }

    if (taskForm.task_type === "repository" && !taskForm.branch_name?.trim()) {
      toast.error("请输入分支名称");
      return;
    }

    if (selectedCategories.length === 0) {
      toast.error("请至少选择一个扫描项");
      return;
    }

    const project = selectedProject;
    if (!project) {
      toast.error("未找到选中的项目");
      return;
    }

    try {
      setCreating(true);
      
      // 整合所有配置到 scan_config
      const scanConfig = {
        // 基础配置
        branch_name: taskForm.branch_name || project.default_branch || 'main',
        task_type: taskForm.task_type,
        
        // 排除规则
        exclude_patterns: taskForm.exclude_patterns,
        
        // 扫描项
        scan_categories: selectedCategories,
        
        // 高级选项
        include_tests: taskForm.scan_config.include_tests,
        include_docs: taskForm.scan_config.include_docs,
        max_file_size: taskForm.scan_config.max_file_size,
        analysis_depth: taskForm.scan_config.analysis_depth,
      };

      console.log('🎯 开始创建审计任务（通过后端API）...', { 
        projectId: project.id, 
        projectName: project.name,
        repositoryType: project.repository_type,
        scanConfig: scanConfig
      });

      // 使用统一的API接口创建任务（会根据配置自动选择后端或前端）
      const task = await api.createAuditTask({
        project_id: project.id,
        task_type: taskForm.task_type,
        branch_name: taskForm.branch_name || project.default_branch || 'main',
        exclude_patterns: taskForm.exclude_patterns,
        scan_config: scanConfig,
        llm_provider_id: taskForm.llm_provider_id,
        created_by: 'local-user' // TODO: 使用实际用户ID
      });
      
      console.log('✅ 任务创建成功:', task.id);
      
      // 记录用户操作
      import('@/shared/utils/logger').then(({ logger, LogCategory }) => {
        logger.logUserAction('创建审计任务', {
          taskId: task.id,
          projectId: project.id,
          projectName: project.name,
          taskType: taskForm.task_type,
          branch: taskForm.branch_name,
        });
      });
      
      // 关闭创建对话框
      onOpenChange(false);
      resetForm();
      onTaskCreated();
      
      // 根据配置决定是否显示终端进度窗口
      if (showProgressDialog) {
        setCurrentTaskId(task.id);
        setShowTerminalDialog(true);
        toast.success("审计任务已创建并启动", {
          description: '正在监控任务进度...',
          duration: 4000
        });
      } else {
        toast.success("审计任务已创建并启动", {
          description: '任务正在后台处理，请稍后在任务列表查看结果',
          duration: 4000
        });
      }
    } catch (error) {
      console.error('❌ 创建任务失败:', error);
      
      // 记录错误并显示详细信息
      import('@/shared/utils/errorHandler').then(({ handleError }) => {
        handleError(error, '创建审计任务失败');
      });
      
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      toast.error(`创建任务失败: ${errorMessage}`);
    } finally {
      setCreating(false);
    }
  };

  const resetForm = () => {
    setTaskForm({
      project_id: "",
      task_type: "repository",
      branch_name: "main",
      exclude_patterns: ["node_modules/**", ".git/**", "dist/**", "build/**", "*.log"],
      scan_config: {
        include_tests: true,
        include_docs: false,
        max_file_size: 1024,
        analysis_depth: "standard",
        scan_categories: []
      }
    });
    setSearchTerm("");
    setSelectedCategories([...categories]); // 重置为全选
  };

  const toggleExcludePattern = (pattern: string) => {
    const patterns = taskForm.exclude_patterns || [];
    if (patterns.includes(pattern)) {
      setTaskForm({
        ...taskForm,
        exclude_patterns: patterns.filter(p => p !== pattern)
      });
    } else {
      setTaskForm({
        ...taskForm,
        exclude_patterns: [...patterns, pattern]
      });
    }
  };

  const addCustomPattern = (pattern: string) => {
    if (pattern.trim() && !taskForm.exclude_patterns.includes(pattern.trim())) {
      setTaskForm({
        ...taskForm,
        exclude_patterns: [...taskForm.exclude_patterns, pattern.trim()]
      });
    }
  };

  const removeExcludePattern = (pattern: string) => {
    setTaskForm({
      ...taskForm,
      exclude_patterns: taskForm.exclude_patterns.filter(p => p !== pattern)
    });
  };

  const toggleCategory = (category: string) => {
    if (selectedCategories.includes(category)) {
      setSelectedCategories(selectedCategories.filter(c => c !== category));
    } else {
      setSelectedCategories([...selectedCategories, category]);
    }
  };

  const selectAllCategories = () => {
    setSelectedCategories([...categories]);
  };

  const clearAllCategories = () => {
    setSelectedCategories([]);
  };

  const selectedProject = projects.find(p => p.id === taskForm.project_id);
  const filteredProjects = projects.filter(project =>
    project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    project.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-3">
          <DialogTitle className="flex items-center space-x-2">
            <Shield className="w-5 h-5 text-primary" />
            <span>新建审计任务</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* 项目选择 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base font-medium">选择项目</Label>
              <Badge variant="outline" className="text-xs">
                {filteredProjects.length} 个可用项目
              </Badge>
            </div>

            {/* 项目搜索 */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="搜索项目名称..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* 项目列表 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-60 overflow-y-auto">
              {loading ? (
                <div className="col-span-full flex items-center justify-center py-6">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : filteredProjects.length > 0 ? (
                filteredProjects.map((project) => (
                  <Card 
                    key={project.id} 
                    className={`cursor-pointer transition-all duration-200 border-2 ${
                      taskForm.project_id === project.id 
                        ? 'border-primary bg-primary/5 shadow-lg' 
                        : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
                    }`}
                    onClick={() => setTaskForm({ 
                      ...taskForm, 
                      project_id: taskForm.project_id === project.id ? "" : project.id 
                    })}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          {/* 项目名称 */}
                          <h4 className={`font-semibold text-base mb-1.5 ${
                            taskForm.project_id === project.id ? 'text-primary' : 'text-gray-900'
                          }`}>
                            {project.name}
                          </h4>
                          {/* 项目描述 */}
                          {project.description && (
                            <p className="text-xs text-gray-500 mb-1.5 line-clamp-2 leading-relaxed">
                              {project.description}
                            </p>
                          )}
                          {/* 项目信息 */}
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className="text-xs font-normal">
                              {project.repository_type?.toUpperCase() || 'OTHER'}
                            </Badge>
                            <div className="flex items-center text-xs text-gray-500">
                              <GitBranch className="w-3 h-3 mr-1" />
                              {project.default_branch}
                            </div>
                          </div>
                        </div>
                        {taskForm.project_id === project.id && (
                          <div className="flex-shrink-0">
                            <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center ring-2 ring-primary/20">
                              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <div className="col-span-full text-center py-6 text-gray-500">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">
                    {searchTerm ? '未找到匹配的项目' : '暂无可用项目'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* 任务配置 */}
          {selectedProject && (
            <Tabs defaultValue="basic" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="basic" className="flex items-center space-x-2">
                  <GitBranch className="w-4 h-4" />
                  <span>基础配置</span>
                </TabsTrigger>
                <TabsTrigger value="scan-items" className="flex items-center space-x-2">
                  <Shield className="w-4 h-4" />
                  <span>扫描项</span>
                </TabsTrigger>
                <TabsTrigger value="exclude" className="flex items-center space-x-2">
                  <FileText className="w-4 h-4" />
                  <span>排除规则</span>
                </TabsTrigger>
                <TabsTrigger value="advanced" className="flex items-center space-x-2">
                  <Settings className="w-4 h-4" />
                  <span>高级选项</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="basic" className="space-y-4 mt-6">
                {/* ZIP项目文件信息 */}
                {(selectedProject.repository_type === 'zip' || selectedProject.zip_file_path) && (
                  <Card className="bg-green-50 border-green-200">
                    <CardContent className="p-4">
                      <div className="space-y-3">
                        {selectedProject.zip_file_path ? (
                          <div className="flex items-start space-x-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                            <Info className="w-5 h-5 text-green-600 mt-0.5" />
                            <div className="flex-1">
                              <p className="font-medium text-green-900 text-sm">ZIP文件已就绪</p>
                              <p className="text-xs text-green-700 mt-1">
                                项目的 ZIP 文件已存储在服务器，扫描时会自动使用
                              </p>
                              <p className="text-xs text-gray-600 mt-1 font-mono break-all">
                                路径: {selectedProject.zip_file_path}
                              </p>
                            </div>
                          </div>
                        ) : loadingZipFile ? (
                          <div className="flex items-center space-x-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                            <p className="text-sm text-blue-800">正在加载保存的ZIP文件...</p>
                          </div>
                        ) : zipFile ? (
                          <div className="flex items-start space-x-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                            <Info className="w-5 h-5 text-green-600 mt-0.5" />
                            <div className="flex-1">
                              <p className="font-medium text-green-900 text-sm">已准备就绪</p>
                              <p className="text-xs text-green-700 mt-1">
                                使用保存的ZIP文件: {zipFile.name} (
                                {zipFile.size >= 1024 * 1024 
                                  ? `${(zipFile.size / 1024 / 1024).toFixed(2)} MB`
                                  : zipFile.size >= 1024
                                  ? `${(zipFile.size / 1024).toFixed(2)} KB`
                                  : `${zipFile.size} B`
                                })
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setZipFile(null);
                                setHasLoadedZip(false);
                              }}
                            >
                              更换文件
                            </Button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-start space-x-3">
                              <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
                              <div>
                                <p className="font-medium text-amber-900 text-sm">需要上传ZIP文件</p>
                                <p className="text-xs text-amber-700 mt-1">
                                  项目尚未上传 ZIP 文件，请先在项目管理中上传
                                </p>
                              </div>
                            </div>
                            
                            <div className="space-y-2">
                              <Label htmlFor="zipFile">上传ZIP文件</Label>
                              <Input
                                id="zipFile"
                                type="file"
                                accept=".zip"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    console.log('📁 选择的文件:', {
                                      name: file.name,
                                      size: file.size,
                                      type: file.type,
                                      sizeMB: (file.size / 1024 / 1024).toFixed(2)
                                    });
                                    
                                    const validation = validateZipFile(file);
                                    if (!validation.valid) {
                                      toast.error(validation.error || "文件无效");
                                      e.target.value = '';
                                      return;
                                    }
                                    setZipFile(file);
                                    setHasLoadedZip(true);
                                    
                                    const sizeMB = (file.size / 1024 / 1024).toFixed(2);
                                    const sizeKB = (file.size / 1024).toFixed(2);
                                    const sizeText = file.size >= 1024 * 1024 ? `${sizeMB} MB` : `${sizeKB} KB`;
                                    
                                    toast.success(`已选择文件: ${file.name} (${sizeText})`);
                                  }
                                }}
                                className="cursor-pointer"
                              />
                            </div>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="task_type">任务类型</Label>
                    <Select 
                      value={taskForm.task_type} 
                      onValueChange={(value: any) => setTaskForm({ ...taskForm, task_type: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="repository">
                          <div className="flex items-center space-x-2">
                            <GitBranch className="w-4 h-4" />
                            <span>仓库审计</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="instant">
                          <div className="flex items-center space-x-2">
                            <Zap className="w-4 h-4" />
                            <span>即时分析</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="llm_provider">LLM 提供商</Label>
                    <Select 
                      value={taskForm.llm_provider_id?.toString() || "default"} 
                      onValueChange={(value) => setTaskForm({ 
                        ...taskForm, 
                        llm_provider_id: value === "default" ? undefined : parseInt(value)
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="选择 LLM 提供商" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">
                          <div className="flex items-center space-x-2">
                            <Settings className="w-4 h-4" />
                            <span>使用系统默认配置</span>
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
                    <p className="text-xs text-muted-foreground">
                      选择此任务使用的 LLM 提供商，默认使用系统配置
                    </p>
                  </div>

                  {taskForm.task_type === "repository" && (selectedProject.repository_url) && (
                    <div className="space-y-2">
                      <Label htmlFor="branch_name">目标分支</Label>
                      <Input
                        id="branch_name"
                        value={taskForm.branch_name || ""}
                        onChange={(e) => setTaskForm({ ...taskForm, branch_name: e.target.value })}
                        placeholder={selectedProject.default_branch || "main"}
                      />
                    </div>
                  )}
                </div>

                {/* 项目信息展示 */}
                <Card className="bg-blue-50 border-blue-200">
                  <CardContent className="p-4">
                    <div className="flex items-start space-x-3">
                      <Info className="w-5 h-5 text-blue-600 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium text-blue-900 mb-1">选中项目：{selectedProject.name}</p>
                        <div className="text-blue-700 space-y-1">
                          {selectedProject.description && (
                            <p>描述：{selectedProject.description}</p>
                          )}
                          <p>默认分支：{selectedProject.default_branch}</p>
                          {selectedProject.programming_languages && (
                            <p>编程语言：{JSON.parse(selectedProject.programming_languages).join(', ')}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="scan-items" className="space-y-4 mt-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-base font-medium">扫描项选择</Label>
                      <p className="text-sm text-gray-500 mt-1">
                        选择要检查的代码质量维度（至少选择一项）
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="sm"
                        onClick={selectAllCategories}
                      >
                        全选
                      </Button>
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="sm"
                        onClick={clearAllCategories}
                      >
                        清空
                      </Button>
                    </div>
                  </div>

                  {loadingCategories ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                  ) : categoriesError ? (
                    <Card className="bg-red-50 border-red-200">
                      <CardContent className="p-6">
                        <div className="flex flex-col items-center justify-center space-y-4">
                          <AlertCircle className="w-12 h-12 text-red-500" />
                          <div className="text-center">
                            <p className="font-medium text-red-900 mb-1">加载扫描类别失败</p>
                            <p className="text-sm text-red-700">
                              无法从服务器获取扫描类别，请检查网络连接
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            onClick={loadCategories}
                            className="border-red-300 text-red-700 hover:bg-red-100"
                          >
                            重试
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ) : categories.length === 0 ? (
                    <Card className="bg-amber-50 border-amber-200">
                      <CardContent className="p-6">
                        <div className="flex items-start space-x-3">
                          <AlertCircle className="w-6 h-6 text-amber-600 mt-0.5" />
                          <div>
                            <p className="font-medium text-amber-900 mb-1">暂无可用的扫描类别</p>
                            <p className="text-sm text-amber-700">
                              请先在系统中配置提示词类别
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {categories.map((category) => (
                        <div 
                          key={category} 
                          className={`flex items-center space-x-2 p-3 border rounded-lg cursor-pointer transition-all ${
                            selectedCategories.includes(category)
                              ? 'border-primary bg-primary/5 hover:bg-primary/10'
                              : 'hover:bg-gray-50 hover:border-gray-300'
                          }`}
                          onClick={() => toggleCategory(category)}
                        >
                          <Checkbox
                            checked={selectedCategories.includes(category)}
                            onCheckedChange={() => toggleCategory(category)}
                          />
                          <div className="flex-1">
                            <p className="text-sm font-medium whitespace-nowrap">
                              {category}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedCategories.length > 0 && (
                    <Card className="bg-blue-50 border-blue-200">
                      <CardContent className="p-4">
                        <div className="flex items-start space-x-3">
                          <Info className="w-5 h-5 text-blue-600 mt-0.5" />
                          <div className="text-sm">
                            <p className="font-medium text-blue-900 mb-1">
                              已选择 {selectedCategories.length} 个扫描项
                            </p>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {selectedCategories.map(cat => (
                                <Badge key={cat} variant="secondary" className="text-xs">
                                  {cat}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="exclude" className="space-y-4 mt-6">
                <div className="space-y-4">
                  <div>
                    <Label className="text-base font-medium">排除模式</Label>
                    <p className="text-sm text-gray-500 mt-1">
                      选择要从审计中排除的文件和目录模式
                    </p>
                  </div>

                  {/* 常用排除模式 */}
                  <div className="grid grid-cols-2 gap-3">
                    {commonExcludePatterns.map((pattern) => (
                      <div key={pattern.value} className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50">
                        <Checkbox
                          checked={taskForm.exclude_patterns.includes(pattern.value)}
                          onCheckedChange={() => toggleExcludePattern(pattern.value)}
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{pattern.label}</p>
                          <p className="text-xs text-gray-500">{pattern.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* 自定义排除模式 */}
                  <div className="space-y-2">
                    <Label>自定义排除模式</Label>
                    <div className="flex space-x-2">
                      <Input
                        placeholder="例如: *.tmp, test/**"
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            addCustomPattern(e.currentTarget.value);
                            e.currentTarget.value = '';
                          }
                        }}
                      />
                      <Button 
                        type="button" 
                        variant="outline"
                        onClick={(e) => {
                          const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                          addCustomPattern(input.value);
                          input.value = '';
                        }}
                      >
                        添加
                      </Button>
                    </div>
                  </div>

                  {/* 已选择的排除模式 */}
                  {taskForm.exclude_patterns.length > 0 && (
                    <div className="space-y-2">
                      <Label>已选择的排除模式</Label>
                      <div className="flex flex-wrap gap-2">
                        {taskForm.exclude_patterns.map((pattern) => (
                          <Badge 
                            key={pattern} 
                            variant="secondary" 
                            className="cursor-pointer hover:bg-red-100 hover:text-red-800"
                            onClick={() => removeExcludePattern(pattern)}
                          >
                            {pattern} ×
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="advanced" className="space-y-4 mt-6">
                <div className="space-y-6">
                  <div>
                    <Label className="text-base font-medium">扫描配置</Label>
                    <p className="text-sm text-gray-500 mt-1">
                      配置代码扫描的详细参数
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="flex items-center space-x-3">
                        <Checkbox
                          checked={taskForm.scan_config.include_tests}
                          onCheckedChange={(checked) => 
                            setTaskForm({
                              ...taskForm,
                              scan_config: { ...taskForm.scan_config, include_tests: !!checked }
                            })
                          }
                        />
                        <div>
                          <p className="text-sm font-medium">包含测试文件</p>
                          <p className="text-xs text-gray-500">扫描 *test*, *spec* 等测试文件</p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3">
                        <Checkbox
                          checked={taskForm.scan_config.include_docs}
                          onCheckedChange={(checked) => 
                            setTaskForm({
                              ...taskForm,
                              scan_config: { ...taskForm.scan_config, include_docs: !!checked }
                            })
                          }
                        />
                        <div>
                          <p className="text-sm font-medium">包含文档文件</p>
                          <p className="text-xs text-gray-500">扫描 README, docs 等文档文件</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="max_file_size">最大文件大小 (KB)</Label>
                        <Input
                          id="max_file_size"
                          type="number"
                          value={taskForm.scan_config.max_file_size}
                          onChange={(e) => 
                            setTaskForm({
                              ...taskForm,
                              scan_config: { 
                                ...taskForm.scan_config, 
                                max_file_size: parseInt(e.target.value) || 1024 
                              }
                            })
                          }
                          min="1"
                          max="10240"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="analysis_depth">分析深度</Label>
                        <Select 
                          value={taskForm.scan_config.analysis_depth} 
                          onValueChange={(value: any) => 
                            setTaskForm({
                              ...taskForm,
                              scan_config: { ...taskForm.scan_config, analysis_depth: value }
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="basic">基础扫描</SelectItem>
                            <SelectItem value="standard">标准扫描</SelectItem>
                            <SelectItem value="deep">深度扫描</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  {/* 分析深度说明 */}
                  <Card className="bg-amber-50 border-amber-200">
                    <CardContent className="p-4">
                      <div className="flex items-start space-x-3">
                        <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
                        <div className="text-sm">
                          <p className="font-medium text-amber-900 mb-2">分析深度说明：</p>
                          <ul className="text-amber-800 space-y-1 text-xs">
                            <li>• <strong>基础扫描</strong>：快速检查语法错误和基本问题</li>
                            <li>• <strong>标准扫描</strong>：包含代码质量、安全性和性能分析</li>
                            <li>• <strong>深度扫描</strong>：全面分析，包含复杂度、可维护性等高级指标</li>
                          </ul>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          )}

          {/* 操作按钮 */}
          <div className="flex justify-end space-x-3 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
              取消
            </Button>
            <Button 
              onClick={handleCreateTask} 
              disabled={!taskForm.project_id || creating}
              className="btn-primary"
            >
              {creating ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  创建中...
                </>
              ) : (
                <>
                  <Shield className="w-4 h-4 mr-2" />
                  创建任务
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>

      {/* 终端进度对话框 */}
      <TerminalProgressDialog
        open={showTerminalDialog}
        onOpenChange={setShowTerminalDialog}
        taskId={currentTaskId}
        taskType="repository"
      />
    </Dialog>
  );
}