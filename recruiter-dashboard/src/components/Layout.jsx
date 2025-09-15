// src/components/Layout.jsx
import React from "react";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";

const Layout = ({ children }) => {
  return (
    <div className="flex min-h-screen bg-[#f4f4f7]">
      <Sidebar />
      <div className="ml-60 flex-1 flex flex-col">
        <TopBar />
        <main className="p-10">{children}</main>
      </div>
    </div>
  );
};

export default Layout;
