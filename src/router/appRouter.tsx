import { BrowserRouter, HashRouter } from "react-router-dom";
import Layout from "@/layout";

const RouterBasename = '/'

function AppRouter() {

  return (
    <BrowserRouter basename={RouterBasename}>
      <Layout />
    </BrowserRouter>
  );
}

export default AppRouter;
