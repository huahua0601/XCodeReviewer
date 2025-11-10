/**
 * @deprecated 此文件包含旧的前端 ZIP 扫描逻辑
 * 
 * 所有 ZIP 文件扫描和 LLM 分析现在都在后端进行
 * 请使用 taskHelper.ts 中的新函数
 * 
 * 此文件仅保留用于兼容性，未来版本将删除
 */

import { unzip } from "fflate";
import { CodeAnalysisEngine } from "@/features/analysis/services";
import { api } from "@/shared/config/database";
import { taskControl } from "@/shared/services/taskControl";

const TEXT_EXTENSIONS = [
  ".js", ".ts", ".tsx", ".jsx", ".py", ".java", ".go", ".rs", ".cpp", ".c", ".h", ".cc", ".hh",
  ".cs", ".php", ".rb", ".kt", ".swift", ".sql", ".sh", ".json", ".yml", ".yaml"
  // 注意：已移除 .md，因为文档文件会导致LLM返回非JSON格式
];

const MAX_FILE_SIZE_BYTES = 200 * 1024; // 200KB
const MAX_ANALYZE_FILES = 50;

// 从环境变量读取配置，豆包等API需要更长的延迟
const LLM_GAP_MS = Number(import.meta.env.VITE_LLM_GAP_MS) || 2000; // 默认2秒，避免API限流

function isTextFile(path: string): boolean {
  return TEXT_EXTENSIONS.some(ext => path.toLowerCase().endsWith(ext));
}

function shouldExclude(path: string, excludePatterns: string[]): boolean {
  // 排除 Mac 系统文件
  if (path.includes('__MACOSX/') || path.includes('/.DS_Store') || path.match(/\/\._[^/]+$/)) {
    return true;
  }
  
  // 排除 IDE 和编辑器配置目录
  const idePatterns = [
    '/.vscode/',
    '/.idea/',
    '/.vs/',
    '/.eclipse/',
    '/.settings/'
  ];
  if (idePatterns.some(pattern => path.includes(pattern))) {
    return true;
  }
  
  // 排除版本控制和依赖目录
  const systemDirs = [
    '/.git/',
    '/node_modules/',
    '/vendor/',
    '/dist/',
    '/build/',
    '/.next/',
    '/.nuxt/',
    '/target/',
    '/out/',
    '/__pycache__/',
    '/.pytest_cache/',
    '/coverage/',
    '/.nyc_output/'
  ];
  if (systemDirs.some(dir => path.includes(dir))) {
    return true;
  }
  
  // 排除其他隐藏文件（但保留 .gitignore, .env.example 等重要配置）
  const allowedHiddenFiles = ['.gitignore', '.env.example', '.editorconfig', '.prettierrc'];
  const fileName = path.split('/').pop() || '';
  if (fileName.startsWith('.') && !allowedHiddenFiles.includes(fileName)) {
    return true;
  }
  
  // 排除常见的非代码文件
  const excludeExtensions = [
    '.lock', '.log', '.tmp', '.temp', '.cache',
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico',
    '.pdf', '.zip', '.tar', '.gz', '.rar',
    '.exe', '.dll', '.so', '.dylib',
    '.min.js', '.min.css', '.map'
  ];
  if (excludeExtensions.some(ext => path.toLowerCase().endsWith(ext))) {
    return true;
  }
  
  // 应用用户自定义的排除模式
  return excludePatterns.some(pattern => {
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return regex.test(path);
    }
    return path.includes(pattern);
  });
}

function getLanguageFromPath(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase() || '';
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
    'kt': 'kotlin',
    'swift': 'swift'
  };
  
  return languageMap[extension] || 'text';
}

export async function scanZipFile(params: {
  projectId: string;
  zipFile: File;
  excludePatterns?: string[];
  createdBy?: string;
}): Promise<string> {
  const { projectId, zipFile, excludePatterns = [], createdBy } = params;

  // 创建审计任务，初始化进度字段
  const task = await api.createAuditTask({
    project_id: projectId,
    task_type: "repository",
    branch_name: "uploaded",
    exclude_patterns: excludePatterns,
    scan_config: { source: "zip_upload" },
    created_by: createdBy,
    total_files: 0,
    scanned_files: 0,
    total_lines: 0,
    issues_count: 0,
    quality_score: 0
  } as any);

  const taskId = (task as any).id;

  console.log(`🚀 ZIP任务已创建: ${taskId}，准备启动后台扫描...`);

  // 记录审计任务开始
  import('@/shared/utils/logger').then(({ logger, LogCategory }) => {
    logger.info(LogCategory.SYSTEM, `开始ZIP文件审计: ${taskId}`, {
      taskId,
      projectId,
      fileName: zipFile.name,
      fileSize: zipFile.size,
    });
  });

  // 启动后台扫描任务，不阻塞返回
  (async () => {
    console.log(`🎬 后台扫描任务开始执行: ${taskId}`);
    try {
      // 更新任务状态为运行中
      console.log(`📋 ZIP任务 ${taskId}: 开始更新状态为 running`);
      await api.updateAuditTask(taskId, { 
        status: "running",
        started_at: new Date().toISOString(),
        total_files: 0,
        scanned_files: 0
      } as any);
      console.log(`✅ ZIP任务 ${taskId}: 状态已更新为 running`);

      // 读取ZIP文件
      const arrayBuffer = await zipFile.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      await new Promise<void>((resolve, reject) => {
        unzip(uint8Array, async (err, unzipped) => {
          if (err) {
            await api.updateAuditTask(taskId, { status: "failed" } as any);
            reject(new Error(`ZIP文件解压失败: ${err.message}`));
            return;
          }

          try {
            // 筛选需要分析的文件
            const filesToAnalyze: Array<{ path: string; content: string }> = [];
            
            for (const [path, data] of Object.entries(unzipped)) {
              // 跳过目录
              if (path.endsWith('/')) continue;
              
              // 检查文件类型和排除模式
              if (!isTextFile(path) || shouldExclude(path, excludePatterns)) continue;
              
              // 检查文件大小
              if (data.length > MAX_FILE_SIZE_BYTES) continue;
              
              try {
                const content = new TextDecoder('utf-8').decode(data);
                filesToAnalyze.push({ path, content });
              } catch (decodeError) {
                // 跳过无法解码的文件
                continue;
              }
            }

            // 限制分析文件数量
            const limitedFiles = filesToAnalyze
              .sort((a, b) => a.path.length - b.path.length) // 优先分析路径较短的文件
              .slice(0, MAX_ANALYZE_FILES);

            let totalFiles = limitedFiles.length;
            let scannedFiles = 0;
            let totalLines = 0;
            let totalIssues = 0;
            let qualityScores: number[] = [];
            let failedFiles = 0;

            // 更新总文件数
            console.log(`📊 ZIP任务 ${taskId}: 设置总文件数 ${totalFiles}`);
            await api.updateAuditTask(taskId, {
              status: "running",
              total_files: totalFiles,
              scanned_files: 0,
              total_lines: 0,
              issues_count: 0
            } as any);

            // 分析每个文件
            for (const file of limitedFiles) {
              // ✓ 检查点1：分析文件前检查是否取消
              if (taskControl.isCancelled(taskId)) {
                console.log(`🛑 [检查点1] 任务 ${taskId} 已被用户取消（${scannedFiles}/${totalFiles} 完成），停止分析`);
                await api.updateAuditTask(taskId, {
                  status: "cancelled",
                  total_files: totalFiles,
                  scanned_files: scannedFiles,
                  total_lines: totalLines,
                  issues_count: totalIssues,
                  completed_at: new Date().toISOString()
                } as any);
                taskControl.cleanupTask(taskId);
                resolve();
                return;
              }

              try {
                const language = getLanguageFromPath(file.path);
                const lines = file.content.split(/\r?\n/).length;
                totalLines += lines;

                // 使用AI分析代码
                const analysis = await CodeAnalysisEngine.analyzeCode(file.content, language);
                
                // ✓ 检查点2：LLM分析完成后检查是否取消（最小化浪费）
                if (taskControl.isCancelled(taskId)) {
                  console.log(`🛑 [检查点2] 任务 ${taskId} 在LLM分析完成后检测到取消，跳过保存结果（文件: ${file.path}）`);
                  await api.updateAuditTask(taskId, {
                    status: "cancelled",
                    total_files: totalFiles,
                    scanned_files: scannedFiles,
                    total_lines: totalLines,
                    issues_count: totalIssues,
                    completed_at: new Date().toISOString()
                  } as any);
                  taskControl.cleanupTask(taskId);
                  resolve();
                  return;
                }
                
                qualityScores.push(analysis.quality_score);

                // 保存发现的问题
                for (const issue of analysis.issues) {
                  await api.createAuditIssue({
                    task_id: taskId,
                    file_path: file.path,
                    line_number: issue.line || null,
                    column_number: issue.column || null,
                    issue_type: issue.type || "maintainability",
                    severity: issue.severity || "low",
                    title: issue.title || "Issue",
                    description: issue.description || null,
                    suggestion: issue.suggestion || null,
                    code_snippet: issue.code_snippet || null,
                    ai_explanation: issue.ai_explanation || null,
                    status: "open"
                  } as any);
                  
                  totalIssues++;
                }

                scannedFiles++;

                // 每分析一个文件都更新进度，确保实时性
                console.log(`📈 ZIP任务 ${taskId}: 进度 ${scannedFiles}/${totalFiles} (${Math.round(scannedFiles/totalFiles*100)}%)`);
                await api.updateAuditTask(taskId, {
                  status: "running",
                  total_files: totalFiles,
                  scanned_files: scannedFiles,
                  total_lines: totalLines,
                  issues_count: totalIssues
                } as any);

                // 添加延迟避免API限制（已分析成功，正常延迟）
                await new Promise(resolve => setTimeout(resolve, LLM_GAP_MS));
              } catch (analysisError) {
                failedFiles++;
                scannedFiles++; // 即使失败也要增加计数
                
                console.error(`❌ 分析文件 ${file.path} 失败 (${failedFiles}/${scannedFiles}):`, analysisError);
                
                // 如果是API频率限制错误，增加较长延迟
                const errorMsg = (analysisError as Error).message || '';
                if (errorMsg.includes('频率超限') || errorMsg.includes('429') || errorMsg.includes('Too Many Requests')) {
                  // 检测到限流，逐步增加延迟时间
                  const waitTime = Math.min(60000, 10000 + failedFiles * 5000); // 10秒起步，每次失败增加5秒，最多60秒
                  console.warn(`⏳ API频率限制！等待${waitTime/1000}秒后继续... (已失败: ${failedFiles}次)`);
                  await new Promise(resolve => setTimeout(resolve, waitTime));
                } else {
                  // 其他错误，等待较短时间
                  await new Promise(resolve => setTimeout(resolve, LLM_GAP_MS));
                }
                
                // 更新进度（即使失败也要显示进度）
                console.log(`📈 ZIP任务 ${taskId}: 进度 ${scannedFiles}/${totalFiles} (${Math.round(scannedFiles/totalFiles*100)}%) - 失败: ${failedFiles}`);
                await api.updateAuditTask(taskId, {
                  status: "running",
                  total_files: totalFiles,
                  scanned_files: scannedFiles,
                  total_lines: totalLines,
                  issues_count: totalIssues
                } as any);
              }
            }

            // 计算平均质量分
            const avgQualityScore = qualityScores.length > 0 
              ? qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length
              : 0;

            // 判断任务完成状态
            const successRate = totalFiles > 0 ? ((scannedFiles - failedFiles) / totalFiles) * 100 : 0;
            const taskStatus = failedFiles >= totalFiles ? "failed" : "completed";
            
            console.log(`📊 扫描完成统计: 总计${totalFiles}个文件, 成功${scannedFiles - failedFiles}个, 失败${failedFiles}个, 成功率${successRate.toFixed(1)}%`);
            
            if (failedFiles > 0 && failedFiles < totalFiles) {
              console.warn(`⚠️ 部分文件分析失败，但任务标记为完成。建议检查.env配置或更换LLM提供商`);
            }

            // 更新任务完成状态
            await api.updateAuditTask(taskId, {
              status: taskStatus,
              total_files: totalFiles,
              scanned_files: scannedFiles,
              total_lines: totalLines,
              issues_count: totalIssues,
              quality_score: avgQualityScore,
              completed_at: new Date().toISOString()
            } as any);

            // 记录审计完成
            import('@/shared/utils/logger').then(({ logger, LogCategory }) => {
              logger.info(LogCategory.SYSTEM, `ZIP审计任务完成: ${taskId}`, {
                taskId,
                status: taskStatus,
                totalFiles,
                scannedFiles,
                failedFiles,
                totalLines,
                issuesCount: totalIssues,
                qualityScore: avgQualityScore,
                successRate: successRate.toFixed(1) + '%',
              });
            });

            resolve();
          } catch (processingError) {
            await api.updateAuditTask(taskId, { status: "failed" } as any);
            
            // 记录处理错误
            import('@/shared/utils/errorHandler').then(({ handleError }) => {
              handleError(processingError, `ZIP审计任务处理失败: ${taskId}`);
            });
            
            reject(processingError);
          }
        });
      });
    } catch (error) {
      console.error('❌ ZIP扫描任务执行失败:', error);
      console.error('错误详情:', error);
      try {
        await api.updateAuditTask(taskId, { status: "failed" } as any);
      } catch (updateError) {
        console.error('更新失败状态也失败了:', updateError);
      }
    }
  })().catch(err => {
    console.error('⚠️ 后台任务未捕获的错误:', err);
  });

  console.log(`✅ 返回任务ID: ${taskId}，后台任务正在执行中...`);
  // 立即返回任务ID，让用户可以看到进度
  return taskId;
}

export function validateZipFile(file: File): { valid: boolean; error?: string } {
  // 检查文件类型
  if (!file.type.includes('zip') && !file.name.toLowerCase().endsWith('.zip')) {
    return { valid: false, error: '请上传ZIP格式的文件' };
  }

  // 检查文件大小 (限制为100MB)
  const maxSize = 100 * 1024 * 1024;
  if (file.size > maxSize) {
    return { valid: false, error: '文件大小不能超过100MB' };
  }

  return { valid: true };
}