import React from "react";
import { Outlet } from "react-router-dom";
import DashboardLayout from "../layouts/DashboardLayout";
import { WorkspaceProvider } from "../context/WorkspaceContext";

export default function DashboardRoute() {
  return (
    <WorkspaceProvider>
      <DashboardLayout>
        <Outlet />
      </DashboardLayout>
    </WorkspaceProvider>
  );
}