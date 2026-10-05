import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router-dom";
import "./index.css";
import { LearningProvider } from "./lib/learning";
import { ThemeProvider } from "./lib/theme";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { Listing } from "./pages/Listing";
import { Detail } from "./pages/Detail";
import { Compare } from "./pages/Compare";
import { Config } from "./pages/Config";

const router = createHashRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <Dashboard /> },
      { path: "/listagem", element: <Listing /> },
      { path: "/anuncio/:id", element: <Detail /> },
      { path: "/comparador", element: <Compare /> },
      { path: "/db", element: <Config /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <LearningProvider>
        <RouterProvider router={router} />
      </LearningProvider>
    </ThemeProvider>
  </StrictMode>,
);
