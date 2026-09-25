import { useState } from 'react'
import Login from './screens/Login'
import Dashboard from './screens/Dashboard'
import CreateProject from './screens/CreateProject'
import AIProjectIntake from './screens/AIProjectIntake'
import ScopeReview from './screens/ScopeReview'
import WBSBuilder from './screens/WBSBuilder'
import Constraints from './screens/Constraints'
import OptimizationResults from './screens/OptimizationResults'
import Shell from './components/Shell'

export type Screen =
  | 'login'
  | 'dashboard'
  | 'create-project'
  | 'ai-intake'
  | 'scope-review'
  | 'wbs-builder'
  | 'constraints'
  | 'optimization-results'

export default function App() {
  const [screen, setScreen] = useState<Screen>('login')

  const nav = (s: Screen) => setScreen(s)

  if (screen === 'login') {
    return <Login onLogin={() => nav('dashboard')} />
  }

  const screens: Record<Exclude<Screen, 'login'>, React.ReactNode> = {
    dashboard: <Dashboard nav={nav} />,
    'create-project': <CreateProject nav={nav} />,
    'ai-intake': <AIProjectIntake nav={nav} />,
    'scope-review': <ScopeReview nav={nav} />,
    'wbs-builder': <WBSBuilder nav={nav} />,
    constraints: <Constraints nav={nav} />,
    'optimization-results': <OptimizationResults nav={nav} />,
  }

  return (
    <Shell currentScreen={screen} nav={nav}>
      {screens[screen as Exclude<Screen, 'login'>]}
    </Shell>
  )
}
