const API_URL = 'http://localhost:3001';

async function request(method, path, body = null, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${API_URL}${path}`, options);
  const data = await res.json().catch(() => null);
  
  if (!res.ok) {
    const error = new Error(`Request failed: ${res.status}`);
    error.response = { status: res.status, data };
    throw error;
  }
  return { data };
}

async function run() {
  try {
    console.log('--- Starting E2E Manual QA Scenario ---');

    const emailA = `usera_${Date.now()}@test.com`;
    const emailB = `userb_${Date.now()}@test.com`;
    const pwd = 'password123';

    // 1. Sign up User A
    let res = await request('POST', '/auth/register', {
      email: emailA,
      password: pwd,
      fullName: 'User A'
    });
    const tokenA = res.data.accessToken;
    console.log('✅ User A created');

    // 2. Create Workspace
    res = await request('POST', '/workspaces', {
      name: 'QA Workspace',
      slug: `qa-ws-${Date.now()}`
    }, tokenA);
    const wsSlug = res.data.slug;
    const wsId = res.data.id;
    console.log(`✅ Workspace created: ${wsSlug} (${wsId})`);

    // 3. Create Project
    res = await request('POST', `/workspaces/${wsSlug}/projects`, {
      name: 'QA Project',
      description: 'E2E Testing'
    }, tokenA);
    const projectId = res.data.id;
    console.log(`✅ Project created: ${projectId}`);
    
    // Make project public
    await request('PATCH', `/workspaces/${wsSlug}/projects/${projectId}`, {
      isPublic: true
    }, tokenA);
    console.log(`✅ Project made public`);

    // 4. Invite User B
    res = await request('POST', '/auth/invite', {
      email: emailB,
      role: 'Member',
      workspaceId: wsId
    }, tokenA);
    console.log(`✅ Invite created for User B`);

    // Fetch token directly from Prisma since it's not returned in the API response
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    const inviteRecord = await prisma.invite.findFirst({ where: { email: emailB }, orderBy: { createdAt: 'desc' } });
    const inviteToken = inviteRecord.token;
    await prisma.$disconnect();
    console.log(`✅ Fetched invite token from DB for User B`);

    // 5. Sign up User B (accept invite)
    res = await request('POST', '/auth/accept-invite', {
      token: inviteToken,
      fullName: 'User B',
      password: pwd
    });
    const tokenB = res.data.accessToken;
    const userBId = res.data.user.id;
    console.log(`✅ User B signed up and joined workspace`);

    // 6. User A creates task and assigns to User B
    res = await request('POST', `/workspaces/${wsSlug}/projects/${projectId}/tasks`, {
      title: 'Fix the UI',
      priority: 'High',
      assigneeId: userBId,
      status: 'Todo'
    }, tokenA);
    const taskId = res.data.id;
    console.log(`✅ User A created task ${taskId} assigned to User B`);

    // Add User B to project as Member
    await request('POST', `/workspaces/${wsSlug}/projects/${projectId}/members`, {
      userId: userBId,
      role: 'Member'
    }, tokenA);
    console.log(`✅ User A added User B to the Project`);

    // 7. User B adds a comment
    res = await request('POST', `/workspaces/${wsSlug}/projects/${projectId}/tasks/${taskId}/comments`, {
      body: 'I will start looking at this immediately.'
    }, tokenB);
    console.log(`✅ User B added a comment`);

    // 8. User B changes task status
    res = await request('PATCH', `/workspaces/${wsSlug}/projects/${projectId}/tasks/${taskId}`, {
      status: 'InProgress'
    }, tokenB);
    console.log(`✅ User B changed task status to InProgress`);

    // 9. Test role restrictions: User B tries to delete the project (Should Fail)
    try {
      await request('DELETE', `/workspaces/${wsSlug}/projects/${projectId}`, { name: 'QA Project' }, tokenB);
      console.error('❌ User B was able to delete the project (Should have failed!)');
    } catch (err) {
      if (err.response && err.response.status === 403) {
        console.log(`✅ User B failed to delete the project as expected (403 Forbidden)`);
      } else {
        console.error(`❌ User B got unexpected error trying to delete project: ${err.response?.status}`);
      }
    }

    console.log('--- E2E QA Scenario Passed ---');
    process.exit(0);

  } catch (err) {
    console.error('E2E Test Failed:', err.response?.data || err.message);
    process.exit(1);
  }
}

run();
