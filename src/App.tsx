import { QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from 'react-router'
import { queryClient } from './lib/queryClient'
import AuthProvider from './auth/AuthProvider'
import { PublicOnly, RequireAuth } from './auth/guards'
import OrgProvider from './org/OrgProvider'
import Shell from './components/Shell'
import { AppErrorBoundary, NotFound, RouteError } from './components/ErrorPages'
import Login from './screens/Login'
import Signup from './screens/Signup'
import CheckEmail from './screens/CheckEmail'
import ForgotPassword from './screens/ForgotPassword'
import ResetPassword from './screens/ResetPassword'
import AuthCallback from './screens/AuthCallback'
import Dashboard from './screens/Dashboard'
import CreateProject from './screens/CreateProject'
import AIProjectIntake from './screens/AIProjectIntake'
import ScopeReview from './screens/ScopeReview'
import WBSBuilder from './screens/WBSBuilder'
import Constraints from './screens/Constraints'
import OptimizationResults from './screens/OptimizationResults'

function RootLayout() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  )
}

function AppLayout() {
  return (
    <OrgProvider>
      <Shell>
        <Outlet />
      </Shell>
    </OrgProvider>
  )
}

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <RouteError />,
    children: [
      {
        element: <PublicOnly />,
        children: [
          { path: 'login', element: <Login /> },
          { path: 'signup', element: <Signup /> },
          { path: 'check-email', element: <CheckEmail /> },
          { path: 'forgot-password', element: <ForgotPassword /> },
        ],
      },
      { path: 'reset-password', element: <ResetPassword /> },
      { path: 'auth/callback', element: <AuthCallback /> },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppLayout />,
            children: [
              {
                // Errors inside a page render within the shell so navigation stays usable.
                errorElement: <RouteError inline />,
                children: [
                  { index: true, element: <Dashboard /> },
                  { path: 'projects/new', element: <CreateProject /> },
                  {
                    path: 'projects/:projectId',
                    children: [
                      { index: true, element: <Navigate to="intake" replace /> },
                      { path: 'intake', element: <AIProjectIntake /> },
                      { path: 'scope', element: <ScopeReview /> },
                      { path: 'wbs', element: <WBSBuilder /> },
                      { path: 'constraints', element: <Constraints /> },
                      { path: 'optimization', element: <OptimizationResults /> },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
])

export default function App() {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </AppErrorBoundary>
  )
}
