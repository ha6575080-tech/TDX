import { Link, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function AppLayout() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center space-x-8">
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold text-gray-900">TDX</span>
                <span className="hidden sm:block text-sm text-gray-500">Personal Finance Tracker</span>
              </div>
              <nav className="hidden md:flex items-center space-x-4">
                <Link to="/dashboard" className="text-gray-700 hover:text-gray-900">Dashboard</Link>
              </nav>
            </div>
            <div className="flex items-center space-x-2">
              {user ? (
                <>
                  <button
                    onClick={handleSignOut}
                    className="text-sm text-gray-700 hover:text-gray-900"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <Link
                  to="/login"
                  className="text-gray-700 hover:text-gray-900"
                >
                  Sign in
                </Link>
              )}
            </div>
          </div>
        </div>
      </nav>

      <main>
        <Outlet />
      </main>
    </div>
  )
}