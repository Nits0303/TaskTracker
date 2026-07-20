-- Sprint 20 (revised): scope SAML trust configuration per workspace rather than
-- globally.
--
-- Permissions in this app are per-workspace - there is no instance-level admin -
-- so each workspace's owner should control which identity provider may
-- provision users into their workspace.
--
-- The previous table was a single pinned row ('default'). There is no sensible
-- way to attribute that row to one workspace, so it is dropped and recreated.
-- Any existing configuration must be re-entered from workspace settings, which
-- is a one-paste operation.

-- DropTable (single-row global config)
DROP TABLE IF EXISTS "SamlIdpConfig";

-- CreateTable (per-workspace config)
CREATE TABLE "SamlIdpConfig" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "certificatePem" TEXT NOT NULL,
    "audience" TEXT NOT NULL DEFAULT 'task-tracker',
    "idpEntityId" TEXT,
    "idpSsoUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "SamlIdpConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: one identity provider per workspace.
CREATE UNIQUE INDEX "SamlIdpConfig_workspaceId_key" ON "SamlIdpConfig"("workspaceId");

-- AddForeignKey: deleting a workspace removes its trust config with it.
ALTER TABLE "SamlIdpConfig" ADD CONSTRAINT "SamlIdpConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SamlIdpConfig" ADD CONSTRAINT "SamlIdpConfig_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
