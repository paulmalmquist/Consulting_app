"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { Department, Capability, getBusinessDepartments, getDepartmentCapabilities } from "./bos-api";

interface BusinessContextValue {
  businessId: string | null;
  setBusinessId: (id: string) => void;
  departments: Department[];
  loadingDepartments: boolean;
  capabilities: Capability[];
  loadingCapabilities: boolean;
  activeDeptKey: string | null;
  setActiveDeptKey: (key: string) => void;
  refreshDepartments: () => void;
  refreshCapabilities: (deptKey: string) => void;
}

const BusinessContext = createContext<BusinessContextValue>({
  businessId: null,
  setBusinessId: () => {},
  departments: [],
  loadingDepartments: false,
  capabilities: [],
  loadingCapabilities: false,
  activeDeptKey: null,
  setActiveDeptKey: () => {},
  refreshDepartments: () => {},
  refreshCapabilities: () => {},
});

export function useBusinessContext() {
  return useContext(BusinessContext);
}

const STORAGE_KEY = "bos_business_id";

export function BusinessProvider({ children }: { children: ReactNode }) {
  const [businessId, setBusinessIdRaw] = useState<string | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loadingDepartments, setLoadingDepartments] = useState(false);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [loadingCapabilities, setLoadingCapabilities] = useState(false);
  const [activeDeptKey, setActiveDeptKeyRaw] = useState<string | null>(null);

  const setBusinessId = useCallback((id: string) => {
    setBusinessIdRaw(id);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, id);
    }
  }, []);

  const setActiveDeptKey = useCallback((key: string) => {
    setActiveDeptKeyRaw(key);
  }, []);

  // Restore from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setBusinessIdRaw(stored);
    }
  }, []);

  const refreshDepartments = useCallback(() => {
    if (!businessId) return;
    setLoadingDepartments(true);
    getBusinessDepartments(businessId)
      .then(setDepartments)
      .catch(() => setDepartments([]))
      .finally(() => setLoadingDepartments(false));
  }, [businessId]);

  const refreshCapabilities = useCallback(
    (deptKey: string) => {
      if (!businessId) return;
      setLoadingCapabilities(true);
      getDepartmentCapabilities(businessId, deptKey)
        .then(setCapabilities)
        .catch(() => setCapabilities([]))
        .finally(() => setLoadingCapabilities(false));
    },
    [businessId]
  );

  // Load departments when businessId changes
  useEffect(() => {
    refreshDepartments();
  }, [refreshDepartments]);

  // Load capabilities when activeDeptKey changes
  useEffect(() => {
    if (activeDeptKey) {
      refreshCapabilities(activeDeptKey);
    }
  }, [activeDeptKey, refreshCapabilities]);

  return (
    <BusinessContext.Provider
      value={{
        businessId,
        setBusinessId,
        departments,
        loadingDepartments,
        capabilities,
        loadingCapabilities,
        activeDeptKey,
        setActiveDeptKey,
        refreshDepartments,
        refreshCapabilities,
      }}
    >
      {children}
    </BusinessContext.Provider>
  );
}
