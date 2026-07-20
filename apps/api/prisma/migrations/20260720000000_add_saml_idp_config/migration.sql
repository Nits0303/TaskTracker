-- Sprint 20: move SAML trust configuration out of environment variables and
-- into the database, so SSO can be configured from the settings UI and takes
-- effect without restarting the API.
--
-- Single row by design (id defaults to 'default'): Task Tracker has no
-- instance-level admin role, so one globally trusted IdP is the honest model.

-- CreateTable
CREATE TABLE "SamlIdpConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "certificatePem" TEXT NOT NULL,
    "audience" TEXT NOT NULL DEFAULT 'task-tracker',
    "idpEntityId" TEXT,
    "idpSsoUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "SamlIdpConfig_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "SamlIdpConfig" ADD CONSTRAINT "SamlIdpConfig_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
