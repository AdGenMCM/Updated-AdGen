import React from "react";
import DashboardLayout from "../layouts/DashboardLayout";
import { WorkspaceProvider } from "../context/WorkspaceContext";

export default function DashboardRoute({ children }) {
  return (
    <WorkspaceProvider>
      <DashboardLayout>{children}</DashboardLayout>
    </WorkspaceProvider>
  );
}