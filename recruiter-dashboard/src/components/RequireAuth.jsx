import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { tokenStore } from "../api/client";

const RequireAuth = ({ children }) => {
  const token = tokenStore.get();
  const location = useLocation();
  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return children;
};

export default RequireAuth;
