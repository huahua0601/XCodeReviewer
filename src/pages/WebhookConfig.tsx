import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, CheckCircle, AlertCircle, ArrowLeft, Trash2, RefreshCw } from 'lucide-react';
import { api } from '@/shared/services/unified-api';
import type { WebhookConfig, WebhookLog, Project } from '@/shared/types';
import { toast } from 'sonner';

export default function WebhookConfigPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  
  const [project, setProject] = useState<Project | null>(null);
  const [config, setConfig] = useState<WebhookConfig | null>(null);
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  
  // 表单状态
  const [platform, setPlatform] = useState<'github' | 'gitlab' | 'codecommit'>('github');
  const [autoScan, setAutoScan] = useState(true);
  const [autoComment, setAutoComment] = useState(true);

  useEffect(() => {
    if (projectId) {
      loadData();
    }
  }, [projectId]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // 加载项目信息
      const projectData = await api.getProjectById(projectId!);
      setProject(projectData);
      
      // 尝试加载 webhook 配置
      const webhookConfig = await api.getWebhookConfig(Number(projectId));
      setConfig(webhookConfig);
      
      if (webhookConfig) {
        // 加载日志
        const logsData = await api.getWebhookLogs(webhookConfig.id, 20);
        setLogs(logsData);
      }
    } catch (error) {
      console.error('加载数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateConfig = async () => {
    if (!projectId) return;
    
    try {
      setCreating(true);
      const newConfig = await api.createWebhookConfig({
        project_id: Number(projectId),
        platform,
        events: ['pull_request'],
        auto_scan_enabled: autoScan,
        auto_comment_enabled: autoComment,
      });
      
      setConfig(newConfig);
      toast.success('✅ 创建成功', {
        description: 'Webhook 配置已创建，请在代码托管平台配置 webhook',
      });
    } catch (error: any) {
      toast.error('❌ 创建失败', {
        description: error.message || '创建 webhook 配置失败',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteConfig = async () => {
    if (!config || !confirm('确定要删除 webhook 配置吗？')) return;
    
    try {
      await api.deleteWebhookConfig(config.id);
      setConfig(null);
      setLogs([]);
      toast.success('✅ 删除成功', {
        description: 'Webhook 配置已删除',
      });
    } catch (error: any) {
      toast.error('❌ 删除失败', {
        description: error.message || '删除 webhook 配置失败',
      });
    }
  };

  const copyToClipboard = (text: string, type: 'url' | 'secret') => {
    navigator.clipboard.writeText(text);
    if (type === 'url') {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } else {
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
    toast.success('✅ 已复制', {
      description: `${type === 'url' ? 'Webhook URL' : 'Secret Token'} 已复制到剪贴板`,
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(`/projects/${projectId}`)}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Webhook 配置</h1>
            <p className="text-muted-foreground">{project?.name}</p>
          </div>
        </div>
        {config && (
          <Button variant="destructive" size="sm" onClick={handleDeleteConfig}>
            <Trash2 className="w-4 h-4 mr-2" />
            删除配置
          </Button>
        )}
      </div>

      {config ? (
        // 已配置 - 显示配置信息
        <Tabs defaultValue="config" className="space-y-6">
          <TabsList>
            <TabsTrigger value="config">配置信息</TabsTrigger>
            <TabsTrigger value="logs">事件日志 ({logs.length})</TabsTrigger>
            <TabsTrigger value="guide">配置指南</TabsTrigger>
          </TabsList>

          <TabsContent value="config" className="space-y-6">
            {/* 状态卡片 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  Webhook 已启用
                </CardTitle>
                <CardDescription>
                  上次触发时间: {config.last_triggered_at || '从未触发'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">平台</Label>
                    <div className="mt-1">
                      <Badge>{config.platform.toUpperCase()}</Badge>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">状态</Label>
                    <div className="mt-1">
                      <Badge variant={config.is_active ? 'default' : 'secondary'}>
                        {config.is_active ? '激活' : '禁用'}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>自动扫描</Label>
                    <Switch checked={config.auto_scan_enabled} disabled />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>自动评论</Label>
                    <Switch checked={config.auto_comment_enabled} disabled />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Webhook URL */}
            <Card>
              <CardHeader>
                <CardTitle>Webhook URL</CardTitle>
                <CardDescription>
                  在 {config.platform.charAt(0).toUpperCase() + config.platform.slice(1)} 仓库设置中配置此 URL
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Payload URL</Label>
                  <div className="flex gap-2">
                    <Input
                      value={config.webhook_url}
                      readOnly
                      className="font-mono text-sm"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copyToClipboard(config.webhook_url, 'url')}
                    >
                      {copiedUrl ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Secret Token</Label>
                  <div className="flex gap-2">
                    <Input
                      value={config.secret_token}
                      type="password"
                      readOnly
                      className="font-mono text-sm"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copyToClipboard(config.secret_token, 'secret')}
                    >
                      {copiedSecret ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="logs" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Webhook 事件日志</CardTitle>
                <CardDescription>最近 {logs.length} 条事件记录</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {logs.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      暂无事件记录
                    </div>
                  ) : (
                    logs.map((log) => (
                      <div
                        key={log.id}
                        className="flex items-center justify-between p-3 border rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          {log.processed ? (
                            <CheckCircle className="w-4 h-4 text-green-600" />
                          ) : log.error_message ? (
                            <AlertCircle className="w-4 h-4 text-red-600" />
                          ) : (
                            <RefreshCw className="w-4 h-4 text-yellow-600 animate-spin" />
                          )}
                          <div>
                            <div className="font-medium">
                              {log.event_type}
                              {log.event_action && ` · ${log.event_action}`}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(log.created_at).toLocaleString('zh-CN')}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          {log.task_id && (
                            <Badge variant="outline">Task: {log.task_id.slice(0, 8)}</Badge>
                          )}
                          {log.error_message && (
                            <div className="text-xs text-red-600 mt-1">
                              {log.error_message}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="guide" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>配置指南</CardTitle>
                <CardDescription>
                  如何在 {config.platform.charAt(0).toUpperCase() + config.platform.slice(1)} 中配置 Webhook
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {config.platform === 'github' && (
                  <ol className="list-decimal list-inside space-y-3 text-sm">
                    <li>进入你的 GitHub 仓库页面</li>
                    <li>点击 <code className="px-1 py-0.5 bg-muted rounded">Settings</code> → <code className="px-1 py-0.5 bg-muted rounded">Webhooks</code> → <code className="px-1 py-0.5 bg-muted rounded">Add webhook</code></li>
                    <li>在 <strong>Payload URL</strong> 中粘贴上面的 Webhook URL</li>
                    <li>在 <strong>Secret</strong> 中粘贴上面的 Secret Token</li>
                    <li><strong>Content type</strong> 选择 <code className="px-1 py-0.5 bg-muted rounded">application/json</code></li>
                    <li>在 <strong>Which events would you like to trigger this webhook?</strong> 中选择:</li>
                    <ul className="list-disc list-inside ml-6 space-y-1">
                      <li>勾选 <code className="px-1 py-0.5 bg-muted rounded">Pull requests</code></li>
                    </ul>
                    <li>点击 <strong>Add webhook</strong> 保存</li>
                  </ol>
                )}

                {config.platform === 'gitlab' && (
                  <ol className="list-decimal list-inside space-y-3 text-sm">
                    <li>进入你的 GitLab 项目页面</li>
                    <li>点击 <code className="px-1 py-0.5 bg-muted rounded">Settings</code> → <code className="px-1 py-0.5 bg-muted rounded">Webhooks</code></li>
                    <li>在 <strong>URL</strong> 中粘贴上面的 Webhook URL</li>
                    <li>在 <strong>Secret token</strong> 中粘贴上面的 Secret Token</li>
                    <li>在 <strong>Trigger</strong> 中勾选 <code className="px-1 py-0.5 bg-muted rounded">Merge request events</code></li>
                    <li>点击 <strong>Add webhook</strong> 保存</li>
                  </ol>
                )}

                <Alert>
                  <AlertCircle className="w-4 h-4" />
                  <AlertDescription>
                    <strong>提示:</strong> 配置完成后，创建一个测试 Pull Request 来验证 webhook 是否正常工作。
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      ) : (
        // 未配置 - 显示创建表单
        <Card>
          <CardHeader>
            <CardTitle>创建 Webhook 配置</CardTitle>
            <CardDescription>
              配置 webhook 后，系统将自动扫描 Pull Request 并提供代码审查建议
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>代码托管平台</Label>
              <Select value={platform} onValueChange={(value: any) => setPlatform(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="github">GitHub</SelectItem>
                  <SelectItem value="gitlab">GitLab</SelectItem>
                  <SelectItem value="codecommit">AWS CodeCommit</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>自动扫描</Label>
                  <p className="text-sm text-muted-foreground">
                    PR 创建或更新时自动触发代码扫描
                  </p>
                </div>
                <Switch checked={autoScan} onCheckedChange={setAutoScan} />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>自动评论</Label>
                  <p className="text-sm text-muted-foreground">
                    扫描完成后自动在 PR 中发布评审结果
                  </p>
                </div>
                <Switch checked={autoComment} onCheckedChange={setAutoComment} />
              </div>
            </div>

            <Alert>
              <AlertCircle className="w-4 h-4" />
              <AlertDescription>
                创建配置后，系统将生成唯一的 webhook URL 和 secret token，
                您需要在代码托管平台的仓库设置中配置这些信息。
              </AlertDescription>
            </Alert>

            <Button onClick={handleCreateConfig} disabled={creating} className="w-full">
              {creating ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  创建中...
                </>
              ) : (
                '创建 Webhook 配置'
              )}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

