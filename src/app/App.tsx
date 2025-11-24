import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Toaster, toast } from "sonner";
import { lazy, Suspense, useEffect } from "react";
import Header from "@/components/layout/Header";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

// 懒加载页面组件
const Auth = lazy(() => import("@/pages/Auth"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Projects = lazy(() => import("@/pages/Projects"));
const ProjectDetail = lazy(() => import("@/pages/ProjectDetail"));
const RecycleBin = lazy(() => import("@/pages/RecycleBin"));
const InstantAnalysis = lazy(() => import("@/pages/InstantAnalysis"));
const AuditTasks = lazy(() => import("@/pages/AuditTasks"));
const TaskDetail = lazy(() => import("@/pages/TaskDetail"));
const AdminDashboard = lazy(() => import("@/pages/AdminDashboard"));
const LogsPage = lazy(() => import("@/pages/LogsPage"));
const Prompts = lazy(() => import("@/pages/Prompts"));
const SystemPromptTemplates = lazy(() => import("@/pages/SystemPromptTemplates"));
const WebhookConfig = lazy(() => import("@/pages/WebhookConfig"));

// Loading 组件
function LoadingFallback() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      fontSize: '18px',
      color: '#666'
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ marginBottom: '10px', fontSize: '24px' }}>⏳</div>
        <div>加载中...</div>
      </div>
    </div>
  );
}

// App 内容组件
function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const isAuthPage = location.pathname === '/auth';

  // 监听认证失败事件，自动跳转到登录页面
  useEffect(() => {
    const handleAuthLogout = (event: Event) => {
      const customEvent = event as CustomEvent;
      const reason = customEvent.detail?.reason || 'token_expired';
      
      // 清除可能残留的认证信息
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('current_user');
      
      // 显示提示消息
      if (reason === 'token_expired') {
        toast.error('登录已过期，请重新登录', {
          duration: 3000,
        });
      } else if (reason === 'unauthorized') {
        toast.error('认证失败，请重新登录', {
          duration: 3000,
        });
      }
      
      // 跳转到登录页面
      if (location.pathname !== '/auth') {
        navigate('/auth', { replace: true });
      }
    };

    window.addEventListener('auth:logout', handleAuthLogout);
    
    return () => {
      window.removeEventListener('auth:logout', handleAuthLogout);
    };
  }, [navigate, location.pathname]);

  return (
    <>
      <Toaster position="top-right" />
      {!isAuthPage && <Header />}
      <main className={isAuthPage ? '' : 'container-responsive py-4 md:py-6'}>
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            {/* 认证页面 - 公开访问 */}
            <Route path="/auth" element={<Auth />} />
            
            {/* 受保护的页面 */}
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/projects" element={<ProtectedRoute><Projects /></ProtectedRoute>} />
            <Route path="/projects/:id" element={<ProtectedRoute><ProjectDetail /></ProtectedRoute>} />
            <Route path="/projects/:projectId/webhook" element={<ProtectedRoute><WebhookConfig /></ProtectedRoute>} />
            <Route path="/instant-analysis" element={<ProtectedRoute><InstantAnalysis /></ProtectedRoute>} />
            <Route path="/audit-tasks" element={<ProtectedRoute><AuditTasks /></ProtectedRoute>} />
            <Route path="/tasks/:id" element={<ProtectedRoute><TaskDetail /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
            <Route path="/recycle-bin" element={<ProtectedRoute><RecycleBin /></ProtectedRoute>} />
            <Route path="/logs" element={<ProtectedRoute><LogsPage /></ProtectedRoute>} />
            <Route path="/prompts" element={<ProtectedRoute><Prompts /></ProtectedRoute>} />
            <Route path="/system-prompt-templates" element={<ProtectedRoute><SystemPromptTemplates /></ProtectedRoute>} />
            
            {/* 404 重定向 */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
    </>
  );
}

function App() {
  console.log('🚀 App 启动 - XCodeReviewer 认证系统已集成');
  
  return (
    <BrowserRouter>
      <div className="min-h-screen gradient-bg">
        <AppContent />
      </div>
    </BrowserRouter>
  );
}

export default App;
