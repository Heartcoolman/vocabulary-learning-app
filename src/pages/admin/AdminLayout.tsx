import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import apiClient from '../../services/ApiClient';

export default function AdminLayout() {
    const location = useLocation();
    const navigate = useNavigate();
    const [user, setUser] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        checkAdminAccess();
    }, []);

    const checkAdminAccess = async () => {
        try {
            const userData = await apiClient.getCurrentUser();
            setUser(userData);

            // 前端权限校验：只有管理员可以访问管理后台
            if (userData.role !== 'ADMIN') {
                alert('需要管理员权限');
                navigate('/');
                return;
            }
        } catch (err) {
            console.error('获取用户信息失败:', err);
            navigate('/login');
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-gray-500">加载中...</div>
            </div>
        );
    }

    const menuItems = [
        { path: '/admin', label: '📊 仪表盘', exact: true },
        { path: '/admin/users', label: '👥 用户管理' },
        { path: '/admin/wordbooks', label: '📚 系统词库' },
    ];

    return (
        <div className="flex min-h-screen bg-gray-50">
            {/* 侧边栏 */}
            <aside className="w-64 bg-white border-r border-gray-200">
                <div className="p-6 border-b border-gray-200">
                    <h1 className="text-xl font-bold text-gray-900">管理后台</h1>
                    {user && (
                        <p className="text-sm text-gray-500 mt-1">{user.username}</p>
                    )}
                </div>

                <nav className="p-4 space-y-2">
                    {menuItems.map((item) => {
                        const isActive = item.exact
                            ? location.pathname === item.path
                            : location.pathname.startsWith(item.path);

                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={`
                  block px-4 py-2 rounded-lg
                  transition-all duration-200
                  ${isActive
                                        ? 'bg-blue-50 text-blue-600 font-medium'
                                        : 'text-gray-700 hover:bg-gray-100'
                                    }
                `}
                            >
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>

                <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200 w-64">
                    <Link
                        to="/"
                        className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-all"
                    >
                        ← 返回主页
                    </Link>
                </div>
            </aside>

            {/* 主内容区 */}
            <main className="flex-1 overflow-auto">
                <Outlet />
            </main>
        </div>
    );
}
