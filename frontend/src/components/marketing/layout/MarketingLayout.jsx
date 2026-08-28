import React from "react";
import { Outlet } from "react-router-dom";
import Navbar from "../../../Navbar";
import MarketingFooter from "../footer/MarketingFooter";

export default function MarketingLayout() {
  return (
    <>
      <Navbar />
      <Outlet />
      <MarketingFooter />
    </>
  );
}
