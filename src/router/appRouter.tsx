import { BrowserRouter, HashRouter } from "react-router-dom";
import Layout from "@/layout";

const RouterBasename = '/'

function AppRouter() {

  return (
    <HashRouter>
      <Layout />
    </HashRouter>
  );
}

export default AppRouter;
