import { Injectable, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(
    userId: string,
    workspaceSlug: string,
    query: string,
    scope: 'workspace' | 'project',
    projectId?: string,
  ) {
    // 1. Verify workspace access
    const workspaceUser = await this.prisma.workspaceMember.findFirst({
      where: {
        user: { id: userId },
        workspace: { slug: workspaceSlug },
      },
      include: {
        workspace: true,
      },
    });

    if (!workspaceUser) {
      throw new ForbiddenException('Access to workspace denied');
    }

    const wsId = workspaceUser.workspaceId;
    const isWsOwner = workspaceUser.role === Role.Owner;

    // 2. Project scope access
    if (scope === 'project') {
      if (!projectId) {
        throw new BadRequestException('projectId is required for project scope');
      }
      const project = await this.prisma.project.findFirst({
        where: { id: projectId, workspaceId: wsId },
      });
      if (!project) throw new ForbiddenException('Project not found or not in workspace');
      
      if (!isWsOwner && !project.isPublic) {
        const pm = await this.prisma.projectMember.findFirst({
          where: { projectId, userId },
        });
        if (!pm) throw new ForbiddenException('Access to project denied');
      }
    }

    // 3. Collect accessible project IDs
    let accessibleProjectIds: string[] = [];
    if (scope === 'project') {
      accessibleProjectIds = projectId ? [projectId] : [];
    } else {
      if (isWsOwner) {
        const projects = await this.prisma.project.findMany({
          where: { workspaceId: wsId, isArchived: false },
          select: { id: true },
        });
        accessibleProjectIds = projects.map(p => p.id);
      } else {
        const projects = await this.prisma.project.findMany({
          where: {
            workspaceId: wsId,
            isArchived: false,
            OR: [
              { isPublic: true },
              { members: { some: { userId } } },
            ],
          },
          select: { id: true },
        });
        accessibleProjectIds = projects.map(p => p.id);
      }
    }

    if (accessibleProjectIds.length === 0) {
      return [];
    }

    // 4. Raw SQL for search
    // We use websearch_to_tsquery for full-text search which gracefully handles syntax errors.
    // We use word % query for trigram matching.
    const projectIdsLiteral = accessibleProjectIds.map(id => `'${id}'`).join(', ');

    // The result should include: entity type, id, matched title/name, projectId, projectName, parentTaskId, parentTaskTitle
    // We combine the three entities using UNION ALL
    const rawSql = `
      WITH search_query AS (
        SELECT websearch_to_tsquery('english', $1) AS ts_q,
               $1::text AS trgm_q
      ),
      project_matches AS (
        SELECT 
          'Project' AS "type",
          p.id AS "id",
          p.name AS "title",
          p.id AS "projectId",
          p.name AS "projectName",
          NULL AS "parentTaskId",
          NULL AS "parentTaskTitle",
          NULL AS "avatarUrl",
          GREATEST(
            ts_rank(p."searchVector", sq.ts_q) * 2,
            similarity(p.name, sq.trgm_q)
          ) AS "relevance"
        FROM "Project" p, search_query sq
        WHERE p.id IN (${projectIdsLiteral}) AND p."isArchived" = false
          AND (
            p."searchVector" @@ sq.ts_q OR
            p.name % sq.trgm_q
          )
      ),
      task_matches AS (
        SELECT 
          'Task' AS "type",
          t.id AS "id",
          t.title AS "title",
          t."projectId" AS "projectId",
          p.name AS "projectName",
          NULL AS "parentTaskId",
          NULL AS "parentTaskTitle",
          NULL AS "avatarUrl",
          GREATEST(
            ts_rank(t."searchVector", sq.ts_q) * 2,
            similarity(t.title, sq.trgm_q)
          ) AS "relevance"
        FROM "Task" t
        JOIN "Project" p ON t."projectId" = p.id
        CROSS JOIN search_query sq
        WHERE t."projectId" IN (${projectIdsLiteral}) AND p."isArchived" = false
          AND (
            t."searchVector" @@ sq.ts_q OR
            t.title % sq.trgm_q
          )
      ),
      subtask_matches AS (
        SELECT 
          'SubTask' AS "type",
          st.id AS "id",
          st.title AS "title",
          t."projectId" AS "projectId",
          p.name AS "projectName",
          t.id AS "parentTaskId",
          t.title AS "parentTaskTitle",
          NULL AS "avatarUrl",
          GREATEST(
            ts_rank(st."searchVector", sq.ts_q) * 2,
            similarity(st.title, sq.trgm_q)
          ) AS "relevance"
        FROM "SubTask" st
        JOIN "Task" t ON st."parentTaskId" = t.id
        JOIN "Project" p ON t."projectId" = p.id
        CROSS JOIN search_query sq
        WHERE t."projectId" IN (${projectIdsLiteral}) AND p."isArchived" = false
          AND (
            st."searchVector" @@ sq.ts_q OR
            st.title % sq.trgm_q
          )
      ),
      member_matches AS (
        SELECT 
          'Member' AS "type",
          u.id AS "id",
          u."fullName" AS "title",
          NULL AS "projectId",
          NULL AS "projectName",
          NULL AS "parentTaskId",
          NULL AS "parentTaskTitle",
          u."avatarUrl" AS "avatarUrl",
          GREATEST(
            similarity(u."fullName", sq.trgm_q),
            similarity(u.email, sq.trgm_q)
          ) AS "relevance"
        FROM "WorkspaceMember" wm
        JOIN "User" u ON wm."userId" = u.id
        CROSS JOIN search_query sq
        WHERE wm."workspaceId" = '${wsId}'
          AND u.id != '${userId}'
          AND (
            u."fullName" % sq.trgm_q OR
            u.email % sq.trgm_q OR
            u."fullName" ILIKE '%' || sq.trgm_q || '%' OR
            u.email ILIKE '%' || sq.trgm_q || '%'
          )
      ),
      combined_matches AS (
        SELECT * FROM project_matches
        UNION ALL
        SELECT * FROM task_matches
        UNION ALL
        SELECT * FROM subtask_matches
        UNION ALL
        SELECT * FROM member_matches
      )
      SELECT 
        "type", "id", "title", "projectId", "projectName", "parentTaskId", "parentTaskTitle", "avatarUrl"
      FROM combined_matches
      ORDER BY "relevance" DESC
      LIMIT 20;
    `;

    const results = await this.prisma.$queryRawUnsafe(rawSql, query);
    return results;
  }
}
