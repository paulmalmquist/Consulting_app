"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import {
  createTaskProject,
  listTaskProjects,
  seedNoVendorWinstonBuild,
  type TaskProject,
} from "@/lib/tasks-api";

function CreateProjectForm({
  onCreated,
}: {
  onCreated: (project: TaskProject) => void;
}) {
  const { push } = useToast();
  const [name, setName] = useState("Winston Build (NoVendor)");
  const [key, setKey] = useState("WIN");
  const [description, setDescription] = useState(
    "Self-referential project for managing Winston roadmap and execution."
  );
  const [saving, setSaving] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const project = await createTaskProject({
        name: name.trim(),
        key: key.trim().toUpperCase(),
        description: description.trim(),
        board_type: "scrum",
      });
      onCreated(project);
      push({
        variant: "success",
        title: "Project created",
        description: `${project.key} is ready.`,
      });
    } catch (error) {
      push({
        variant: "danger",
        title: "Could not create project",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs uppercase tracking-[0.14em] text-bm-muted2">Project Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="text-xs uppercase tracking-[0.14em] text-bm-muted2">Key</label>
          <Input value={key} onChange={(e) => setKey(e.target.value.toUpperCase())} required />
        </div>
      </div>
      <div>
        <label className="text-xs uppercase tracking-[0.14em] text-bm-muted2">Description</label>
        <Textarea
          className="min-h-[90px]"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={saving}>
        {saving ? "Creating..." : "Create Project"}
      </Button>
    </form>
  );
}

export default function TasksProjectsPage() {
  const { push } = useToast();
  const [projects, setProjects] = useState<TaskProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);

  const hasWinProject = useMemo(
    () => projects.some((project) => project.key === "WIN"),
    [projects]
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listTaskProjects();
      setProjects(rows);
    } catch (error) {
      push({
        variant: "danger",
        title: "Could not load projects",
        description: error instanceof Error ? error.message : "Unknown error",
      });
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [push]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onSeed = async () => {
    setSeeding(true);
    try {
      const result = await seedNoVendorWinstonBuild();
      await refresh();
      push({
        variant: "success",
        title: "NoVendor project seeded",
        description: `${result.project_key}: ${result.created_issues} new issues created.`,
      });
    } catch (error) {
      push({
        variant: "danger",
        title: "Seed failed",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setSeeding(false);
    }
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 space-y-6">
      <section className="rounded-2xl border border-bm-border/70 bg-bm-surface/30 p-5 sm:p-6">
        <p className="text-xs uppercase tracking-[0.14em] text-bm-muted2">Winston Tasks</p>
        <h1 className="mt-2 text-3xl font-semibold text-bm-text">Projects</h1>
        <p className="mt-2 text-sm text-bm-muted">
          Build Winston with Winston. Board, backlog, sprint planning, and analytics live here.
        </p>
      </section>

      {!hasWinProject && (
        <Card>
          <CardContent className="space-y-3">
            <CardTitle>Create NoVendor Winston Build Project</CardTitle>
            <CardDescription>
              First-run helper: seed the self-referential Winston project with starter issues.
            </CardDescription>
            <Button type="button" onClick={onSeed} disabled={seeding}>
              {seeding ? "Seeding..." : "Create NoVendor Winston Build Project"}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-4">
          <CardTitle>Create Project</CardTitle>
          <CreateProjectForm
            onCreated={(project) => setProjects((prev) => [project, ...prev])}
          />
        </CardContent>
      </Card>

      <section
        data-testid="tasks-project-list"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        {loading && (
          <>
            <div className="h-32 rounded-2xl border border-bm-border/60 bg-bm-surface/30 animate-pulse" />
            <div className="h-32 rounded-2xl border border-bm-border/60 bg-bm-surface/30 animate-pulse" />
            <div className="h-32 rounded-2xl border border-bm-border/60 bg-bm-surface/30 animate-pulse" />
          </>
        )}
        {!loading && projects.length === 0 && (
          <Card>
            <CardContent>
              <p className="text-sm text-bm-muted">No projects yet.</p>
            </CardContent>
          </Card>
        )}
        {!loading &&
          projects.map((project) => (
            <Link
              key={project.id}
              href={`/tasks/${project.key}`}
              data-testid={`tasks-open-project-${project.key}`}
              className="rounded-2xl border border-bm-border/70 bg-bm-surface/30 p-4 hover:border-bm-accent/40 hover:shadow-bm-glow transition"
            >
              <p className="text-xs uppercase tracking-[0.14em] text-bm-muted2">{project.key}</p>
              <p className="mt-1 text-lg font-semibold text-bm-text">{project.name}</p>
              <p className="mt-2 text-sm text-bm-muted">
                {project.description || "No description"}
              </p>
            </Link>
          ))}
      </section>
    </main>
  );
}
