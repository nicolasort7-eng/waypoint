import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { GoalTracker } from "../app/GoalTracker";
import "../app/globals.css";

const root = document.getElementById("root");

if (!root) throw new Error("Waypoint could not find its application window.");

createRoot(root).render(
  <StrictMode>
    <GoalTracker />
  </StrictMode>,
);
