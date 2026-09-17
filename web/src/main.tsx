import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router-dom";
import "./index.css";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { Listing } from "./pages/Listing";
import { Detail } from "./pages/Detail";
import { Compare } from "./pages/Compare";
import { Config } from "./pages/Config";
import { Ai } from "./pages/Ai";

const router = createHashRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <Dashboard /> },
      { path: "/listagem", element: <Listing /> },
      { path: "/anuncio/:id", element: <Detail /> },
      { path: "/comparador", element: <Compare /> },
      { path: "/ia", element: <Ai /> },
      { path: "/db", element: <Config /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
