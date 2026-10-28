// import {Link} from "react-router-dom"
import {useRoutes} from "react-router-dom"
import {routes} from "./router"

function App() {
  const element = useRoutes(routes)

  return (
    <div>
      {/* <nav style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <Link to="/">Home</Link>
        <Link to="/about">About</Link>
        <Link to="/user/list">User List</Link>
        <Link to="/user/detail">User Detail</Link>
      </nav> */}

      {element}
    </div>
  )
}

export default App
