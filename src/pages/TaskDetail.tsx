import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  FileText,
  Calendar,
  GitBranch,
  Shield,
  Bug,
  Download,
  Code,
  Lightbulb,
  Info,
  Zap,
  X,
  ChevronRight,
  Search
} from "lucide-react";
import { api } from "@/shared/services/unified-api";
import type { AuditTask, AuditIssue } from "@/shared/types";
import { toast } from "sonner";
import ExportReportDialog from "@/components/reports/ExportReportDialog";
import { calculateTaskProgress } from "@/shared/utils/utils";
import { taskControl } from "@/shared/services/taskControl";

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

// 问题列表组件
function IssuesList({ 
  issues, 
  totalIssues, 
  currentPage, 
  onPageChange, 
  onSeverityChange,
  onIssuesUpdate,
  statusFilter,
  onStatusChange,
  searchKeyword,
  onSearchChange
}: { 
  issues: AuditIssue[]; 
  totalIssues: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  onSeverityChange: (severity: string) => void;
  onIssuesUpdate: () => void;
  statusFilter: string;
  onStatusChange: (status: string) => void;
  searchKeyword: string;
  onSearchChange: (keyword: string) => void;
}) {
  const [selectedIssues, setSelectedIssues] = useState<Set<number>>(new Set());
  const [isUpdating, setIsUpdating] = useState(false);
  
  const itemsPerPage = 20; // 每页显示20个问题
  
  // 当切换标签页时，重置到第一页
  const handleTabChange = (value: string) => {
    onSeverityChange(value);
    onPageChange(1);
    setSelectedIssues(new Set());
  };
  
  // 切换单个问题选中状态
  const toggleIssueSelection = (issueId: number) => {
    const newSelected = new Set(selectedIssues);
    if (newSelected.has(issueId)) {
      newSelected.delete(issueId);
    } else {
      newSelected.add(issueId);
    }
    setSelectedIssues(newSelected);
  };
  
  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedIssues.size === issues.length) {
      setSelectedIssues(new Set());
    } else {
      setSelectedIssues(new Set(issues.map(i => Number(i.id))));
    }
  };
  
  // 批量更新问题状态
  const handleBulkUpdate = async (status: string) => {
    if (selectedIssues.size === 0) {
      toast.error("请先选择要更新的问题");
      return;
    }
    
    try {
      setIsUpdating(true);
      const issueIds = Array.from(selectedIssues);
      await api.bulkUpdateIssues(issueIds, status);
      toast.success(`成功更新 ${issueIds.length} 个问题`);
      setSelectedIssues(new Set());
      onIssuesUpdate();
    } catch (error) {
      console.error('批量更新问题失败:', error);
      toast.error("批量更新失败");
    } finally {
      setIsUpdating(false);
    }
  };
  
  // 单个问题确认
  const handleSingleConfirm = async (issueId: number) => {
    try {
      await api.updateAuditIssue(String(issueId), { status: 'resolved' });
      toast.success("问题已确认");
      onIssuesUpdate();
    } catch (error) {
      console.error('确认问题失败:', error);
      toast.error("确认失败");
    }
  };
  
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-blue-100 text-blue-800 border-blue-200';
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

  // 计算总页数（基于后端返回的总数）
  const getTotalPages = () => {
    return Math.ceil(totalIssues / itemsPerPage);
  };

  // 分页组件
  const Pagination = ({ total, current, onChange }: { total: number; current: number; onChange: (page: number) => void }) => {
    if (total <= 1) return null;

    const pages = [];
    const maxVisiblePages = 7;
    
    let startPage = Math.max(1, current - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(total, startPage + maxVisiblePages - 1);
    
    if (endPage - startPage < maxVisiblePages - 1) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return (
      <div className="flex items-center justify-center space-x-2 mt-6 pb-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange(current - 1)}
          disabled={current === 1}
          className="px-3"
        >
          上一页
        </Button>
        
        {startPage > 1 && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onChange(1)}
              className="px-3"
            >
              1
            </Button>
            {startPage > 2 && <span className="text-gray-500">...</span>}
          </>
        )}
        
        {pages.map(page => (
          <Button
            key={page}
            variant={page === current ? "default" : "outline"}
            size="sm"
            onClick={() => onChange(page)}
            className={`px-3 ${page === current ? 'bg-primary text-white' : ''}`}
          >
            {page}
          </Button>
        ))}
        
        {endPage < total && (
          <>
            {endPage < total - 1 && <span className="text-gray-500">...</span>}
            <Button
              variant="outline"
              size="sm"
              onClick={() => onChange(total)}
              className="px-3"
            >
              {total}
            </Button>
          </>
        )}
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange(current + 1)}
          disabled={current === total}
          className="px-3"
        >
          下一页
        </Button>
        
        <span className="text-sm text-gray-600 ml-4">
          第 {current} / {total} 页，共 {totalIssues} 条，显示 {itemsPerPage * (current - 1) + 1}-{Math.min(itemsPerPage * current, totalIssues)} 条
        </span>
      </div>
    );
  };

  const renderIssue = (issue: AuditIssue, index: number) => {
    const issueId = Number(issue.id);
    const isSelected = selectedIssues.has(issueId);
    const isResolved = issue.status === 'resolved' || issue.status === 'false_positive';
    
    // Debug logging for first 3 issues
    if (index < 3) {
      console.log(`Issue ${index}:`, {
        id: issue.id,
        title: issue.title?.substring(0, 40) + '...',
        severity: issue.severity,
        has_fix_example: !!issue.fix_example,
        fix_example: issue.fix_example ? issue.fix_example.substring(0, 100) + '...' : 'NULL',
        fix_example_length: issue.fix_example?.length,
        fix_example_trimmed_length: issue.fix_example?.trim().length
      });
    }
    
    return (
    <div key={issue.id || index} className={`bg-white border rounded-lg p-4 hover:shadow-md transition-all duration-200 group ${isSelected ? 'border-primary bg-blue-50' : 'border-gray-200 hover:border-gray-300'} ${isResolved ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start space-x-3">
          {/* 复选框 */}
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => toggleIssueSelection(issueId)}
            className="mt-2 w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary cursor-pointer"
            disabled={isResolved}
          />
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${issue.severity === 'critical' ? 'bg-red-100 text-red-600' :
            issue.severity === 'high' ? 'bg-orange-100 text-orange-600' :
              issue.severity === 'medium' ? 'bg-yellow-100 text-yellow-600' :
                'bg-blue-100 text-blue-600'
            }`}>
            {getTypeIcon(issue.issue_type)}
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-base text-gray-900 mb-1 group-hover:text-gray-700 transition-colors">{issue.title}</h4>
            <div className="flex items-center space-x-1 text-xs text-gray-600">
              <FileText className="w-3 h-3" />
              <span className="font-medium">{issue.file_path}</span>
            </div>
            {issue.line_number && (
              <div className="flex items-center space-x-1 text-xs text-gray-500 mt-1">
                <span>📍</span>
                <span>第 {issue.line_number} 行</span>
                {issue.column_number && <span>，第 {issue.column_number} 列</span>}
              </div>
            )}
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
            {issue.line_number && (
              <span className="text-gray-400 text-xs">第 {issue.line_number} 行</span>
            )}
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

        {(() => {
          const showFixExample = issue.fix_example && issue.fix_example.trim().length > 0;
          if (index < 3) {
            console.log(`Issue ${index} fix_example render check:`, {
              has_fix_example: !!issue.fix_example,
              fix_example_type: typeof issue.fix_example,
              fix_example_length: issue.fix_example?.length,
              trimmed_length: issue.fix_example?.trim().length,
              will_render: showFixExample
            });
          }
          
          return showFixExample ? (
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
          ) : null;
        })()}

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
      
      {/* 状态标签和操作按钮 */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200">
        <div className="flex items-center space-x-2">
          {isResolved ? (
            <Badge className="bg-green-100 text-green-800 border-green-200">
              <CheckCircle className="w-3 h-3 mr-1" />
              {issue.status === 'resolved' ? '已确认' : '误报'}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-gray-600">
              待确认
            </Badge>
          )}
        </div>
        {!isResolved && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleSingleConfirm(issueId)}
            className="text-green-600 hover:text-green-700 hover:bg-green-50"
          >
            <CheckCircle className="w-4 h-4 mr-1" />
            确认
          </Button>
        )}
      </div>
    </div>
  );
  };

  // 注意：不要在这里返回，总是显示标签页，让每个标签页内部处理空状态

  return (
    <div>
      {/* 批量操作工具栏 */}
      {issues.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedIssues.size > 0 && selectedIssues.size === issues.filter(i => i.status !== 'resolved' && i.status !== 'false_positive').length}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                />
                <span className="text-sm text-gray-700 font-medium">
                  全选 {selectedIssues.size > 0 && `(${selectedIssues.size})`}
                </span>
              </label>
              
              {selectedIssues.size > 0 && (
                <div className="flex items-center space-x-2">
                  <Button
                    size="sm"
                    onClick={() => handleBulkUpdate('resolved')}
                    disabled={isUpdating}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    <CheckCircle className="w-4 h-4 mr-1" />
                    批量确认 ({selectedIssues.size})
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleBulkUpdate('false_positive')}
                    disabled={isUpdating}
                    className="text-gray-600 hover:bg-gray-50"
                  >
                    标记为误报
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSelectedIssues(new Set())}
                    className="text-gray-600"
                  >
                    取消选择
                  </Button>
                </div>
              )}
            </div>
            
            <div className="flex items-center space-x-3">
              {/* 搜索框 */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="搜索问题标题..."
                  value={searchKeyword}
                  onChange={(e) => onSearchChange(e.target.value)}
                  className="pl-10 w-[240px]"
                />
              </div>
              
              {/* 状态筛选 */}
              <Select value={statusFilter} onValueChange={onStatusChange}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="问题状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="open">
                    <span className="flex items-center">
                      <span className="w-2 h-2 rounded-full bg-yellow-500 mr-2"></span>
                      待确认
                    </span>
                  </SelectItem>
                  <SelectItem value="resolved">
                    <span className="flex items-center">
                      <span className="w-2 h-2 rounded-full bg-green-500 mr-2"></span>
                      已确认
                    </span>
                  </SelectItem>
                  <SelectItem value="false_positive">
                    <span className="flex items-center">
                      <span className="w-2 h-2 rounded-full bg-gray-500 mr-2"></span>
                      误报
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}
      
    <Tabs defaultValue="all" className="w-full" onValueChange={handleTabChange}>
      <TabsList className="grid w-full grid-cols-5 mb-6">
        <TabsTrigger value="all" className="text-sm">
          全部
        </TabsTrigger>
        <TabsTrigger value="critical" className="text-sm">
          严重
        </TabsTrigger>
        <TabsTrigger value="high" className="text-sm">
          高
        </TabsTrigger>
        <TabsTrigger value="medium" className="text-sm">
          中等
        </TabsTrigger>
        <TabsTrigger value="low" className="text-sm">
          低
        </TabsTrigger>
      </TabsList>

      <TabsContent value="all" className="space-y-4 mt-6">
        {issues.length > 0 ? (
          <>
            {issues.map((issue, index) => renderIssue(issue, index))}
            <Pagination 
              total={getTotalPages()} 
              current={currentPage} 
              onChange={onPageChange}
            />
          </>
        ) : (
          <div className="text-center py-12">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">没有发现问题</h3>
            <p className="text-gray-500">代码质量良好</p>
          </div>
        )}
      </TabsContent>

      <TabsContent value="critical" className="space-y-4 mt-6">
        {issues.length > 0 ? (
          <>
            {issues.map((issue, index) => renderIssue(issue, index))}
            <Pagination 
              total={getTotalPages()} 
              current={currentPage} 
              onChange={onPageChange}
            />
          </>
        ) : (
          <div className="text-center py-12">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">没有发现严重问题</h3>
            <p className="text-gray-500">代码在严重级别的检查中表现良好</p>
          </div>
        )}
      </TabsContent>

      <TabsContent value="high" className="space-y-4 mt-6">
        {issues.length > 0 ? (
          <>
            {issues.map((issue, index) => renderIssue(issue, index))}
            <Pagination 
              total={getTotalPages()} 
              current={currentPage} 
              onChange={onPageChange}
            />
          </>
        ) : (
          <div className="text-center py-12">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">没有发现高优先级问题</h3>
            <p className="text-gray-500">代码在高优先级检查中表现良好</p>
          </div>
        )}
      </TabsContent>

      <TabsContent value="medium" className="space-y-4 mt-6">
        {issues.length > 0 ? (
          <>
            {issues.map((issue, index) => renderIssue(issue, index))}
            <Pagination 
              total={getTotalPages()} 
              current={currentPage} 
              onChange={onPageChange}
            />
          </>
        ) : (
          <div className="text-center py-12">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">没有发现中等优先级问题</h3>
            <p className="text-gray-500">代码在中等优先级检查中表现良好</p>
          </div>
        )}
      </TabsContent>

      <TabsContent value="low" className="space-y-4 mt-6">
        {issues.length > 0 ? (
          <>
            {issues.map((issue, index) => renderIssue(issue, index))}
            <Pagination 
              total={getTotalPages()} 
              current={currentPage} 
              onChange={onPageChange}
            />
          </>
        ) : (
          <div className="text-center py-12">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">没有发现低优先级问题</h3>
            <p className="text-gray-500">代码在低优先级检查中表现良好</p>
          </div>
        )}
      </TabsContent>
    </Tabs>
    </div>
  );
}

export default function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const [task, setTask] = useState<AuditTask | null>(null);
  const [issues, setIssues] = useState<AuditIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [currentSeverity, setCurrentSeverity] = useState('all');
  const [currentStatus, setCurrentStatus] = useState<string>('all');
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [totalIssues, setTotalIssues] = useState(0);
  const [issuesPerPage] = useState(20);
  const [isScanConfigExpanded, setIsScanConfigExpanded] = useState(false);

  useEffect(() => {
    if (id) {
      loadTaskDetail();
    }
  }, [id]);

  // 当页码、严重程度或状态变化时，重新加载issues
  useEffect(() => {
    if (id && task) {
      loadIssues();
    }
  }, [id, currentPage, currentSeverity, currentStatus, searchKeyword]);

  // 对于运行中或等待中的任务，静默更新进度（不触发loading状态）
  useEffect(() => {
    if (!task || !id) {
      return;
    }

    // 运行中或等待中的任务需要定时更新
    if (task.status === 'running' || task.status === 'pending') {
      const intervalId = setInterval(async () => {
        try {
          // 静默获取任务数据
          const taskData = await api.getAuditTaskById(id);

          // 只有数据真正变化时才更新状态
          if (taskData && (
            taskData.status !== task.status ||
            taskData.scanned_files !== task.scanned_files ||
            taskData.issues_count !== task.issues_count
          )) {
            setTask(taskData);
            // 重新加载当前页的issues
            loadIssues();
          }
        } catch (error) {
          console.error('静默更新任务失败:', error);
        }
      }, 3000); // 每3秒静默更新一次

      return () => clearInterval(intervalId);
    }
  }, [task?.status, task?.scanned_files, id, currentPage, currentSeverity, currentStatus, searchKeyword]);

  const loadTaskDetail = async () => {
    if (!id) return;

    try {
      setLoading(true);
      const taskData = await api.getAuditTaskById(id);
      setTask(taskData);
      
      // 加载第一页的issues
      await loadIssues();
    } catch (error) {
      console.error('Failed to load task detail:', error);
      toast.error("加载任务详情失败");
    } finally {
      setLoading(false);
    }
  };

  const loadIssues = async () => {
    if (!id) return;

    try {
      const response = await api.getAuditIssues(id, currentPage, issuesPerPage, currentSeverity, currentStatus, searchKeyword);
      // Debug: Check API response
      console.log('API Response:', {
        is_array: Array.isArray(response),
        items_count: Array.isArray(response) ? response.length : response.items?.length,
        first_item_fix_example: Array.isArray(response) 
          ? response[0]?.fix_example 
          : response.items?.[0]?.fix_example
      });
      
      // Handle both array and object response formats
      if (Array.isArray(response)) {
        setIssues(response);
        setTotalIssues(response.length);
      } else {
        setIssues(response.items);
        setTotalIssues(response.total);
      }
    } catch (error) {
      console.error('Failed to load issues:', error);
      toast.error("加载问题列表失败");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'running': return 'bg-red-50 text-red-800';
      case 'failed': return 'bg-red-100 text-red-900';
      case 'cancelled': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-4 h-4" />;
      case 'running': return <Activity className="w-4 h-4" />;
      case 'failed': return <AlertTriangle className="w-4 h-4" />;
      case 'cancelled': return <Clock className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };


  const handleCancel = async () => {
    if (!id || !task) return;
    
    if (!confirm('确定要取消此任务吗？已分析的结果将被保留。')) {
      return;
    }
    
    // 1. 标记任务为取消状态（让后台循环检测到）
    taskControl.cancelTask(id);
    
    // 2. 立即更新本地状态显示
    setTask(prev => prev ? { ...prev, status: 'cancelled' as const } : prev);
    
    // 3. 尝试立即更新数据库（后台也会更新，这里是双保险）
    try {
      await api.updateAuditTask(id, { status: 'cancelled' } as any);
      toast.success("任务已取消");
    } catch (error) {
      console.error('更新取消状态失败:', error);
      toast.warning("任务已标记取消，后台正在停止...");
    }
    
    // 4. 1秒后再次刷新，确保显示最新状态
    setTimeout(() => {
      loadTaskDetail();
    }, 1000);
  };



  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center space-x-4">
          <Link to="/audit-tasks">
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              返回任务列表
            </Button>
          </Link>
        </div>
        <Card className="card-modern">
          <CardContent className="empty-state py-16">
            <div className="empty-icon">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">任务不存在</h3>
            <p className="text-gray-500">请检查任务ID是否正确</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 使用公共函数计算进度百分比
  const progressPercentage = calculateTaskProgress(task.scanned_files, task.total_files);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link to="/audit-tasks">
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              返回任务列表
            </Button>
          </Link>
          <div>
            <h1 className="page-title">任务详情</h1>
            <p className="page-subtitle">{task.project?.name || '未知项目'} - 审计任务</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <Badge className={getStatusColor(task.status)}>
            {getStatusIcon(task.status)}
            <span className="ml-2">
              {task.status === 'completed' ? '已完成' :
                task.status === 'running' ? '运行中' :
                  task.status === 'failed' ? '失败' :
                    task.status === 'cancelled' ? '已取消' : '等待中'}
            </span>
          </Badge>
          
          {/* 运行中或等待中的任务显示取消按钮 */}
          {(task.status === 'running' || task.status === 'pending') && (
            <Button 
              size="sm" 
              variant="outline"
              onClick={handleCancel}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <X className="w-4 h-4 mr-2" />
              取消任务
            </Button>
          )}
          
          {/* 已完成的任务显示导出按钮 */}
          {task.status === 'completed' && (
            <Button 
              size="sm" 
              className="btn-primary"
              onClick={() => setExportDialogOpen(true)}
            >
              <Download className="w-4 h-4 mr-2" />
              导出报告
            </Button>
          )}
        </div>
      </div>

      {/* 任务概览 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="stat-card">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="stat-label">扫描进度</p>
                <p className="stat-value text-xl">{progressPercentage}%</p>
                <Progress value={progressPercentage} className="mt-2" />
              </div>
              <div className="stat-icon from-primary to-accent">
                <Activity className="w-5 h-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="stat-label">发现问题</p>
                <p className="stat-value text-xl text-orange-600">{task.issues_count}</p>
              </div>
              <div className="stat-icon from-orange-500 to-orange-600">
                <Bug className="w-5 h-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="stat-label">代码文件</p>
                <p className="stat-value text-xl text-primary">
                  <span className="text-emerald-600">{task.scanned_files || 0}</span>
                  <span className="text-gray-400 text-base"> / </span>
                  <span>{task.total_files || 0}</span>
                </p>
                <p className="text-xs text-gray-500 mt-1">已分析 / 代码文件</p>
              </div>
              <div className="stat-icon from-emerald-500 to-emerald-600">
                <FileText className="w-5 h-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="stat-label">代码行数</p>
                <p className="stat-value text-xl">{(task.total_lines || 0).toLocaleString()}</p>
              </div>
              <div className="stat-icon from-purple-500 to-purple-600">
                <FileText className="w-5 h-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 任务信息 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:items-start">
        <div className="lg:col-span-2 h-full">
          <Card className="card-modern h-full">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Shield className="w-5 h-5 text-primary" />
                <span>任务信息</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-500">任务类型</p>
                  <p className="text-base">
                    {task.task_type === 'repository' ? '仓库审计任务' : '即时分析任务'}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">目标分支</p>
                  <p className="text-base flex items-center">
                    <GitBranch className="w-4 h-4 mr-1" />
                    {task.branch_name || '默认分支'}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">LLM 提供商</p>
                  <p className="text-base flex items-center">
                    <Zap className="w-4 h-4 mr-1" />
                    {task.llm_provider ? (
                      <span className="flex items-center space-x-1">
                        {task.llm_provider.icon && <span>{task.llm_provider.icon}</span>}
                        <span>{task.llm_provider.display_name}</span>
                      </span>
                    ) : (
                      <span className="text-gray-400">系统默认</span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">创建时间</p>
                  <p className="text-base flex items-center">
                    <Calendar className="w-4 h-4 mr-1" />
                    {formatDate(task.created_at)}
                  </p>
                </div>
                {task.completed_at && (
                  <div>
                    <p className="text-sm font-medium text-gray-500">完成时间</p>
                    <p className="text-base flex items-center">
                      <CheckCircle className="w-4 h-4 mr-1" />
                      {formatDate(task.completed_at)}
                    </p>
                  </div>
                )}
              </div>

              {/* 扫描配置 - 优化显示 */}
              {task.scan_config && (
                <div className="space-y-3">
                  <div>
                      <button
                        onClick={() => setIsScanConfigExpanded(!isScanConfigExpanded)}
                        className="flex items-center space-x-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors mb-2"
                      >
                        <span>扫描配置</span>
                        <ChevronRight className={`w-4 h-4 transition-transform ${isScanConfigExpanded ? 'rotate-90' : ''}`} />
                      </button>
                      
                      {isScanConfigExpanded ? (
                        <div className="bg-gray-50 rounded-lg p-3 max-h-96 overflow-y-auto border border-gray-200">
                          <pre className="text-xs text-gray-600 whitespace-pre-wrap">
                            {JSON.stringify(JSON.parse(task.scan_config), null, 2)}
                          </pre>
                        </div>
                      ) : (
                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                          {(() => {
                            const config = JSON.parse(task.scan_config);
                            return (
                              <>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                  {config.branch_name && (
                                    <div className="flex items-center space-x-2">
                                      <span className="text-gray-500">分支:</span>
                                      <span className="text-gray-700 font-medium">{config.branch_name}</span>
                                    </div>
                                  )}
                                  {config.task_type && (
                                    <div className="flex items-center space-x-2">
                                      <span className="text-gray-500">类型:</span>
                                      <span className="text-gray-700 font-medium">{config.task_type}</span>
                                    </div>
                                  )}
                                  {config.scan_categories && (
                                    <div className="flex items-center space-x-2 col-span-2">
                                      <span className="text-gray-500">扫描类别:</span>
                                      <span className="text-gray-700 font-medium">{config.scan_categories.length} 个</span>
                                    </div>
                                  )}
                                  {config.max_file_size && (
                                    <div className="flex items-center space-x-2">
                                      <span className="text-gray-500">最大文件:</span>
                                      <span className="text-gray-700 font-medium">{config.max_file_size} KB</span>
                                    </div>
                                  )}
                                  {config.analysis_depth && (
                                    <div className="flex items-center space-x-2">
                                      <span className="text-gray-500">分析深度:</span>
                                      <span className="text-gray-700 font-medium">{config.analysis_depth}</span>
                                    </div>
                                  )}
                                </div>
                                <div className="mt-2 text-xs text-gray-400 flex items-center space-x-1">
                                  <Info className="w-3 h-3" />
                                  <span>点击展开查看完整配置</span>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="h-full">
          <Card className="card-modern h-full flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <FileText className="w-5 h-5 text-primary" />
                <span>项目信息</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 flex-1">
              {task.project ? (
                <>
                  <div>
                    <p className="text-sm font-medium text-gray-500">项目名称</p>
                    <Link to={`/projects/${task.project.id}`} className="text-base text-primary hover:underline">
                      {task.project.name}
                    </Link>
                  </div>
                  {task.project.description && (
                    <div>
                      <p className="text-sm font-medium text-gray-500">项目描述</p>
                      <p className="text-sm text-gray-600">{task.project.description}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-gray-500">仓库类型</p>
                    <p className="text-base">{task.project.repository_type?.toUpperCase() || 'OTHER'}</p>
                  </div>
                  {task.project.programming_languages && (
                    <div>
                      <p className="text-sm font-medium text-gray-500 mb-2">编程语言</p>
                      <div className="flex flex-wrap gap-1">
                        {JSON.parse(task.project.programming_languages).map((lang: string) => (
                          <Badge key={lang} variant="secondary" className="text-xs">
                            {lang}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-gray-500">项目信息不可用</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 问题列表 - 始终显示，即使某个严重程度下没有问题 */}
      {task && task.status === 'completed' && (
        <Card className="card-modern">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Bug className="w-6 h-6 text-orange-600" />
              <span>发现的问题 ({totalIssues})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <IssuesList 
            issues={issues} 
            totalIssues={totalIssues}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            onSeverityChange={setCurrentSeverity}
            onIssuesUpdate={loadIssues}
            statusFilter={currentStatus}
            onStatusChange={setCurrentStatus}
            searchKeyword={searchKeyword}
            onSearchChange={(keyword) => {
              setSearchKeyword(keyword);
              setCurrentPage(1); // 搜索时重置到第一页
            }}
          />
          </CardContent>
        </Card>
      )}

      {/* 导出报告对话框 */}
      {task && (
        <ExportReportDialog
          open={exportDialogOpen}
          onOpenChange={setExportDialogOpen}
          task={task}
          issues={issues}
        />
      )}
    </div>
  );
}