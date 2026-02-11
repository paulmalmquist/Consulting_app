-- 003_rbac_department_scoping.sql
-- Department-scoped RBAC: link roles to departments with specific permission sets.

CREATE TABLE IF NOT EXISTS app.department_roles (
  department_id uuid NOT NULL REFERENCES app.departments(department_id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES app.roles(role_id) ON DELETE CASCADE,
  permissions text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (department_id, role_id)
);

COMMENT ON TABLE app.department_roles IS 'Per-department permission grants for roles. permissions[] contains keys like read, write, delete, approve, admin.';
