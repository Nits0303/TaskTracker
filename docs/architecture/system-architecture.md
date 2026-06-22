# System Architecture

A full-stack view of the Task Tracker platform showing all components, 
their communication patterns, and how they are containerized in Docker.

## Component Architecture

```mermaid
graph TD
    Browser["Browser (Next.js 15)"]
    Browser -->|REST API calls (Axios + JWT Bearer)| API["NestJS API Server"]
    Browser -->|WebSocket connection (Socket.IO client)| API
    
    subgraph API ["NestJS API Server"]
        Auth["Auth Module (JWT + Google OAuth + Passport)"]
        Workspace["Workspace Module"]
        Project["Project Module"]
        Task["Task Module"]
        Chat["Chat Module"]
        Calendar["Calendar Module"]
        Search["Search Module (PostgreSQL Full-Text + Trigram)"]
        Dashboard["Dashboard Module"]
        Notification["Notification Module"]
        Activity["Activity Module (BullMQ Producer)"]
        AuditLog["Audit Log Module"]
        Health["Health Module (@nestjs/terminus)"]
        Gateway["Realtime Gateway (Socket.IO Server)"]
    end
    
    API --> PostgreSQL["PostgreSQL (Prisma ORM)"]
    API --> Redis["Redis (ioredis)"]
    API --> MinIO["MinIO (File Storage)"]
    API --> BullMQWorkers["BullMQ Workers"]
    
    subgraph Redis ["Redis"]
        SocketAdapter["Socket.IO Adapter"]
        BullStorage["BullMQ Queue Storage"]
        RateLimit["Rate Limiting Storage"]
        Presence["Presence TTL Keys"]
        Cache["Dashboard Cache"]
    end
    
    subgraph BullMQWorkers ["BullMQ Workers"]
        ActivityWorker["Activity Feed Worker"]
        NotifWorker["Notification Worker"]
        NotifWorker --> InApp["In-App (Socket.IO emit)"]
        NotifWorker --> Email["Email (Nodemailer/SMTP)"]
        NotifWorker --> Push["Push (web-push/VAPID)"]
    end
```

## Docker Container Architecture

```mermaid
graph LR
    subgraph DockerNetwork ["Docker Network: task-tracker-network"]
        Web["web (Next.js) :3000"]
        Api["api (NestJS) :3001"]
        Pg["postgres :5433"]
        Redis["redis :6380"]
        Minio["minio API:9000 Console:9001"]
        
        Web -->|HTTP + WebSocket| Api
        Api --> Pg
        Api --> Redis
        Api --> Minio
        Api -->|healthcheck on /health| Api
    end
```

## Real-Time Event Flow

```mermaid
graph LR
    Action["User Action (e.g. drag task to new column)"]
    ZustandOpt["Frontend optimistic update (Zustand store)"]
    Rest["REST API call (PATCH /tasks/:id)"]
    Nest["NestJS Task Service"]
    DbWrite["Prisma write to PostgreSQL"]
    Queue["Activity Queue (BullMQ)"]
    Emit["RealtimeGateway.emitToProject()"]
    PubSub["Redis pub/sub (Socket.IO adapter)"]
    Clients["All connected clients in project room"]
    ZustandSync["Each client's Zustand store updated"]
    Render["UI re-renders"]
    
    Action --> ZustandOpt
    ZustandOpt --> Rest
    Rest --> Nest
    Nest --> DbWrite
    DbWrite --> Queue
    Queue --> Emit
    Emit --> PubSub
    PubSub --> Clients
    Clients --> ZustandSync
    ZustandSync --> Render
```
