"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { logError } from "@/lib/logging/logger";
import ResumeFallbackCard from "./ResumeFallbackCard";

type ResumeModuleBoundaryProps = {
  boundaryId: string;
  eyebrow?: string;
  title: string;
  message: string;
  resetKey?: string | number | null;
  children: ReactNode;
};

type ResumeModuleBoundaryState = {
  hasError: boolean;
  errorId: string | null;
};

class ResumeModuleBoundaryInner extends Component<
  ResumeModuleBoundaryProps,
  ResumeModuleBoundaryState
> {
  state: ResumeModuleBoundaryState = {
    hasError: false,
    errorId: null,
  };

  static getDerivedStateFromError(error: Error): ResumeModuleBoundaryState {
    return {
      hasError: true,
      errorId:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `resume_${Date.now()}`,
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logError("resume.module_boundary", "Resume widget render failed", {
      boundary_id: this.props.boundaryId,
      error_message: error.message,
      component_stack: info.componentStack,
    });
  }

  componentDidUpdate(prevProps: ResumeModuleBoundaryProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, errorId: null });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <ResumeFallbackCard
          eyebrow={this.props.eyebrow}
          title={this.props.title}
          body={this.props.message}
          meta={this.state.errorId ? `Reference: ${this.state.errorId}` : null}
          tone="warning"
        />
      );
    }

    return this.props.children;
  }
}

export default function ResumeModuleBoundary(props: ResumeModuleBoundaryProps) {
  return <ResumeModuleBoundaryInner {...props} />;
}
