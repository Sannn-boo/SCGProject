```mermaid
flowchart TD
 flowchart TD
    %% Styling Classes
    classDef userClass fill:#dbeafe,stroke:#3b82f6,stroke-width:2px,color:#1e3a8a;
    classDef frontClass fill:#e0f2fe,stroke:#0284c7,stroke-width:1.5px,color:#0369a1;
    classDef backClass fill:#fef3c7,stroke:#d97706,stroke-width:1.5px,color:#92400e;
    classDef pipeClass fill:#dcfce7,stroke:#16a34a,stroke-width:1.5px,color:#15803d;
    classDef neuralClass fill:#ffe4e6,stroke:#e11d48,stroke-width:1.5px,color:#9f1239;
    classDef workerClass fill:#f3e8ff,stroke:#9333ea,stroke-width:1.5px,color:#6b21a8;
    classDef dbClass fill:#ffedd5,stroke:#ea580c,stroke-width:2px,color:#9a3412;
    classDef waitClass fill:#fef9c3,stroke:#ca8a04,stroke-width:2px,stroke-dasharray: 4 4,color:#854d0e;

    User(("👤 User (Clinician)")):::userClass

    %% Frontend Subgraph
    subgraph Frontend ["Frontend Client (Next.js - web/)"]
        Page["State Controller & Job State<br/><b>[page.tsx]</b>"]:::frontClass

        subgraph Screens ["UI Screens"]
            Upload["Photo Upload<br/><b>[Upload.tsx]</b>"]:::frontClass
            Framing["Frame & Coverage Review<br/><b>[Framing.tsx]</b>"]:::frontClass
            Processing["Progress & Pipeline Status<br/><b>[Processing.tsx]</b>"]:::frontClass
            Review["Interactive Cut Review<br/><b>[Review.tsx]</b>"]:::frontClass
            Result["Measurement Results<br/><b>[Result.tsx]</b>"]:::frontClass
        end

        subgraph Renderers ["3D Viewers & Mesh Loaders"]
            CutViewer["3D Cut Plane Viewer<br/><b>[CutReview.tsx]</b>"]:::frontClass
            MeshView["3D Mesh Viewer (Three.js)<br/><b>[Viewport / MeshView.tsx]</b>"]:::frontClass
            PlyLoader["PLY Scene Loader<br/><b>[usePly.ts]</b>"]:::frontClass
        end

        API["Browser API Client<br/><b>[api.ts]</b>"]:::frontClass
        Data["Artifact Readers<br/><b>[data.ts]</b>"]:::frontClass
    end

    %% Backend Service Subgraph
    subgraph BackendServ ["Backend Service (FastAPI - service/)"]
        App["HTTP REST Service<br/><b>[app.py]</b>"]:::backClass
        JobRunner["Job Queue & Runner<br/><b>[jobs.py]</b>"]:::backClass
        StageRun["Stage Runner Subprocess<br/><b>[stagerun.py]</b>"]:::backClass
    end

    %% Pipeline Stages Subgraph
    subgraph Pipeline ["Clinical Reconstruction Pipeline (Sequential Stages)"]
        direction TB
        S0["<b>Stage 0: Photo Preparation</b><br/>[stages/prep.py]"]:::pipeClass
        S1["<b>Stage 1: VGGT Inference</b><br/>[stages/inference.py]"]:::pipeClass
        S2["<b>Stage 2: Point Cloud Generation</b><br/>[stages/pointcloud.py]"]:::pipeClass
        
        WaitCut{{"⏸️ Human In-the-Loop<br/>[State: awaiting-cut]"}}:::waitClass
        
        S3["<b>Stage 3: Marker Segmentation & Clean</b><br/>[stages/clean.py]"]:::pipeClass
        S4["<b>Stage 4: Mesh Reconstruction</b><br/>[stages/reconstruct.py]"]:::pipeClass
        S5["<b>Stage 5: Mesh Repair & Watertight</b><br/>[stages/watertight.py]"]:::pipeClass
        S6["<b>Stage 6: Volume Calibration</b><br/>[stages/volume.py]"]:::pipeClass
    end

    %% Neural Networks Subgraph
    subgraph Neural ["Neural AI Models"]
        VLM["<b>VLM Detection Model</b><br/>[core/vlm_detect.py]<br/>(GroundingDINO + SAM)"]:::neuralClass
        
        subgraph VGGT ["VGGT Architecture [vggt.py]"]
            Aggregator["Feature Aggregation<br/><b>[aggregator.py]</b>"]:::neuralClass
            DPT["DPT Heads (Depth + Point Map)<br/><b>[dpt_head.py]</b>"]:::neuralClass
            Camera["Camera Head (Pose Estimation)<br/><b>[camera_head.py]</b>"]:::neuralClass
        end
    end

    %% Helpers & Workers Subgraph
    subgraph Workers ["Helpers & Subprocess Workers"]
        SegHelper["Segmentation Helper<br/><b>[core/segmentation.py]</b>"]:::workerClass
        ReconsWorker["Reconstruction Worker<br/><b>[workers/recons_methods_worker.py]</b>"]:::workerClass
        MeshFixWorker["Mesh Repair Worker<br/><b>[workers/meshfix_worker.py]</b>"]:::workerClass
    end

    Artifacts[("📁 Job Artifacts & Storage<br/>[output/<job_id>/ & checkpoints/]")]:::dbClass

    %% Connections: User & Page
    User --> Page
    Page --> Upload
    Page --> Framing
    Page --> Processing
    Page --> Review
    Page --> Result

    %% Connections: UI to API / Renderers
    Upload -->|"1. creates job (POST /jobs)"| API
    Framing -->|"2. confirms framing / rebuild"| API
    Processing -->|"polls status (GET /jobs/:id)"| API
    Review --> CutViewer
    CutViewer --> PlyLoader
    Review -->|"4. confirms cut (POST /recut)"| API
    Result --> MeshView
    MeshView --> PlyLoader
    Result -->|"loads metrics & CSV"| Data

    Data -->|"reads CSV/stats"| App
    PlyLoader -->|"fetches scene PLY"| App
    API -->|"HTTP Requests"| App

    %% Connections: Backend Service Flow
    App -->|"submit(job, '0') & submit(job, '1-6')"| JobRunner
    App -->|"submit(job, '3-6', --cut-only)"| JobRunner
    App -.->|"serves static files"| Artifacts
    JobRunner -->|"spawns: python stagerun.py &lt;stage&gt;"| StageRun

    %% Sequential Pipeline Execution
    StageRun --> S0
    S0 -->|"prepped images & masks"| S1
    S1 -->|"point maps & poses"| S2
    S2 -->|"writes scene_mesh.ply"| Artifacts
    S2 --> WaitCut
    
    WaitCut -.->|"sets job state"| JobRunner
    WaitCut ==>|"resumes after POST /recut"| S3
    
    S3 -->|"cleaned point cloud"| S4
    S4 -->|"raw reconstructed mesh"| S5
    S5 -->|"watertight mesh"| S6
    S6 -->|"writes final volumes.csv & meshes"| Artifacts

    %% Neural Model Invocations
    S0 -.->|"detects marker & bounds"| VLM
    S1 -.->|"runs feed-forward"| VGGT
    VGGT --> Aggregator
    VGGT --> DPT
    VGGT --> Camera

    %% Worker Invocations
    S3 -.->|"calls helper"| SegHelper
    S4 -.->|"spawns subprocess"| ReconsWorker
    S5 -.->|"spawns subprocess"| MeshFixWorker
```
