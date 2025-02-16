# 🚀 Scalable Reverse Proxy with Node.js & Redis

## ⚡ Overview
This is a **high-performance, scalable reverse proxy** built from scratch using **Node.js Cluster, Redis caching, and rate limiting**. It efficiently distributes traffic across backend servers, ensuring fault tolerance and high availability.

## 🔥 Features
- **Load Balancing** – Uses a round-robin strategy to distribute traffic.
- **Multi-Process Support** – Spawns multiple worker processes dynamically.
- **YAML Configuration** – Easily configure routes and upstreams.
- **Redis Caching** – Improves performance by caching responses.
- **Rate Limiting & Throttling** – Prevents abuse and ensures fair resource usage.
- **Health Checks** – Routes traffic only to live servers.
- **Auto-Restart** – Workers restart on failure.
- **Static File Serving** – Directly serve static files when matched in configuration.
- **WebSockets & Authentication Support** *(Upcoming)*.

## 📜 Configuration (config.yaml)
```yaml
server:
  listen: 8000
  workers: 4

  upstreams:
    - id: jsonplaceholder
      url: jsonplaceholder.typicode.com

    - id: users
      url: jsonplaceholder.typicode.com

    - id: posts
      url: jsonplaceholder.typicode.com

    - id: comments
      url: jsonplaceholder.typicode.com

    - id: fallingfalling
      url: papertoilet.com

  headers:
    - name: x-forwarded-for
      value: "$ip"

    - name: Authorization
      value: "zain"

  rules:
    - path: "^/todos$"  # Exact match
      upstream:  
        - jsonplaceholder
      
    - path: "^/posts(?:/\\d+)?$"  
      upstream:  
        - posts
    
    - path: "^/comments(?:/\\d+)?$" 
      upstream:  
        - comments
    
    - path: "^/users/(\\d+)/comments$"
      upstream:  
        - users
    
    - path: "^/$"
      static_file: proxy-guide.html 

```

## 🛠 Setup & Installation
### Prerequisites
- **Node.js** (v16+ recommended)
- **Redis** (for caching & rate limiting)

### Installation
```sh
git clone https://github.com/zaineli/ReverseProxy.git
cd ReverseProxy
npm install
```

### Start Redis Server
```sh
redis-server
```

### Run the Reverse Proxy
```sh
npm run dev
```

## 🚧 Roadmap & Upcoming Features
✅ **Redis caching & rate limiting** (Done)
🔹 Least-connections load balancing
🔹 JWT authentication & request logging
🔹 WebSocket proxying
🔹 CI/CD pipeline for auto-deployments

## 🤝 Contribute
Love networking, Node.js, or DevOps? **Jump in!** Fork, open an issue, or submit a PR. Let’s build something awesome together! 🚀

[💻 GitHub Repo](https://github.com/zaineli/ReverseProxy)  
**Star ⭐ | Fork 🍴 | Contribute 🚀**
