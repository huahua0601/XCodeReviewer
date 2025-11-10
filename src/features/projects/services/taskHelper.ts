/**
 * 审计任务辅助函数
 * 
 * 注意：所有扫描和 LLM 分析现在都在后端进行
 * 前端只负责创建任务并监听进度更新
 */

import { api } from '@/shared/services/unified-api';
import type { CreateAuditTaskForm } from '@/shared/types';

/**
 * 创建仓库审计任务
 * 
 * 注意：扫描和分析都在后端进行，前端只创建任务
 */
export async function createRepositoryAuditTask(params: {
  projectId: string;
  repoUrl?: string;
  branch?: string;
  exclude?: string[];
  llmProviderId?: number;
  createdBy?: string;
}): Promise<string> {
  const taskData: CreateAuditTaskForm & { created_by: string } = {
    project_id: params.projectId,
    task_type: 'repository',
    branch_name: params.branch || 'main',
    exclude_patterns: params.exclude || [],
    scan_config: {},
    llm_provider_id: params.llmProviderId,
    created_by: params.createdBy || 'system',
  };

  const task = await api.createAuditTask(taskData);
  return task.id;
}

/**
 * 创建ZIP文件审计任务
 * 
 * 注意：需要先上传ZIP文件到后端，然后创建任务
 * 
 * @deprecated ZIP 文件应该在创建项目时上传到后端
 * 后续扫描直接从后端文件系统读取
 */
export async function createZipAuditTask(params: {
  projectId: string;
  zipFile?: File;
  excludePatterns?: string[];
  llmProviderId?: number;
  createdBy?: string;
}): Promise<string> {
  // TODO: 实现 ZIP 文件上传到后端
  // 目前暂时使用 repository 类型
  
  const taskData: CreateAuditTaskForm & { created_by: string } = {
    project_id: params.projectId,
    task_type: 'full_scan', // ZIP 文件扫描类型
    branch_name: 'main',
    exclude_patterns: params.excludePatterns || [],
    scan_config: {},
    llm_provider_id: params.llmProviderId,
    created_by: params.createdBy || 'system',
  };

  const task = await api.createAuditTask(taskData);
  return task.id;
}

/**
 * 取消审计任务
 */
export async function cancelAuditTask(taskId: string): Promise<void> {
  // 使用后端 API 取消任务
  const taskIdNum = parseInt(taskId, 10);
  if (isNaN(taskIdNum)) {
    throw new Error('Invalid task ID');
  }
  
  // TODO: 调用后端取消 API
  // await api.tasks.cancel(taskIdNum);
  
  console.log(`任务 ${taskId} 已请求取消`);
}

