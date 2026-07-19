import { BadRequestException } from '@nestjs/common';
import { AuditEventType, Role } from '@prisma/client';
import { SamlService } from './saml.service';

/**
 * Sprint 18: JIT provisioning rules. The service is instantiated directly with
 * mocks rather than through the Nest DI container - these are pure branching
 * rules and the container adds nothing but brittleness here.
 */
describe('SamlService — JIT provisioning', () => {
  const WORKSPACE = { id: 'ws-1', slug: 'engineering' };
  const USER = { id: 'u-1', email: 'jane@corp.com', fullName: 'Jane Doe' };

  let prisma: any;
  let authService: any;
  let auditLogService: any;
  let configService: any;
  let service: SamlService;

  const baseProfile = {
    nameID: 'jane@corp.com',
    email: 'jane@corp.com',
    name: 'Jane Doe',
    workspace: 'engineering',
    role: 'Member',
  };

  beforeEach(() => {
    prisma = {
      workspace: { findUnique: jest.fn().mockResolvedValue(WORKSPACE) },
      user: {
        findUnique: jest.fn().mockResolvedValue(USER),
        create: jest.fn().mockResolvedValue(USER),
        update: jest.fn().mockResolvedValue(USER),
      },
      workspaceMember: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'wm-1' }),
        update: jest.fn().mockResolvedValue({ id: 'wm-1' }),
      },
    };
    authService = {
      generateTokens: jest
        .fn()
        .mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' }),
    };
    auditLogService = { log: jest.fn().mockResolvedValue(undefined) };
    configService = { get: jest.fn().mockReturnValue('task-tracker') };

    service = new SamlService(prisma, authService, auditLogService, configService);
  });

  it('creates the user AND the membership for a brand-new email (the demo moment)', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const result = await service.provisionAndLogin(baseProfile, '1.2.3.4');

    expect(prisma.user.create).toHaveBeenCalled();
    expect(prisma.workspaceMember.create).toHaveBeenCalledWith({
      data: { userId: USER.id, workspaceId: WORKSPACE.id, role: Role.Member },
    });
    expect(auditLogService.log).toHaveBeenCalledWith(
      expect.objectContaining({ event: AuditEventType.WORKSPACE_MEMBER_INVITED }),
    );
    expect(result).toEqual({ accessToken: 'at', refreshToken: 'rt', workspaceSlug: 'engineering' });
  });

  it('overwrites the role when an existing member is at a different role', async () => {
    prisma.workspaceMember.findUnique.mockResolvedValue({ id: 'wm-1', role: Role.Viewer });

    await service.provisionAndLogin(baseProfile);

    expect(prisma.workspaceMember.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { role: Role.Member } }),
    );
    expect(auditLogService.log).toHaveBeenCalledWith(
      expect.objectContaining({ event: AuditEventType.WORKSPACE_MEMBER_ROLE_CHANGED }),
    );
  });

  it('does not write when the member is already at the asserted role', async () => {
    prisma.workspaceMember.findUnique.mockResolvedValue({ id: 'wm-1', role: Role.Member });

    await service.provisionAndLogin(baseProfile);

    expect(prisma.workspaceMember.update).not.toHaveBeenCalled();
    expect(prisma.workspaceMember.create).not.toHaveBeenCalled();
  });

  it('NEVER demotes an existing Owner, but still logs them in', async () => {
    prisma.workspaceMember.findUnique.mockResolvedValue({ id: 'wm-1', role: Role.Owner });

    const result = await service.provisionAndLogin(baseProfile);

    expect(prisma.workspaceMember.update).not.toHaveBeenCalled();
    expect(auditLogService.log).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: AuditEventType.WORKSPACE_MEMBER_ROLE_CHANGED }),
    );
    expect(result.accessToken).toBe('at'); // login still succeeds
  });

  it('rejects an asserted role of Owner', async () => {
    await expect(
      service.provisionAndLogin({ ...baseProfile, role: 'Owner' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.workspaceMember.create).not.toHaveBeenCalled();
  });

  it('rejects a role outside Admin/Member/Viewer', async () => {
    await expect(
      service.provisionAndLogin({ ...baseProfile, role: 'Superuser' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an unknown workspace slug and never auto-creates a workspace', async () => {
    prisma.workspace.findUnique.mockResolvedValue(null);

    await expect(
      service.provisionAndLogin({ ...baseProfile, workspace: 'does-not-exist' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.workspaceMember.create).not.toHaveBeenCalled();
  });

  it('rejects an assertion with no email/NameID', async () => {
    await expect(
      service.provisionAndLogin({ ...baseProfile, email: undefined, nameID: undefined }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lowercases the email before lookup', async () => {
    await service.provisionAndLogin({ ...baseProfile, email: 'JANE@CORP.COM' });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'jane@corp.com' },
    });
  });

  it('mints a session and stores a hashed refresh token', async () => {
    await service.provisionAndLogin(baseProfile);

    expect(authService.generateTokens).toHaveBeenCalledWith(USER.id, USER.email);
    // refreshToken persisted must be the bcrypt hash, never the raw token
    const updateArg = prisma.user.update.mock.calls[0][0];
    expect(updateArg.data.refreshToken).not.toBe('rt');
    expect(auditLogService.log).toHaveBeenCalledWith(
      expect.objectContaining({ event: AuditEventType.LOGIN_SUCCESS }),
    );
  });
});
