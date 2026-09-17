# Chat App — Azure Key Vault Secrets Demo

A real-time chat application running on Kubernetes with secrets pulled from Azure Key Vault at pod startup.

## Stack
- **Node.js/Express** + **Socket.io** — real-time chat
- **PostgreSQL** — persistent message storage
- **Redis** — pub/sub broadcasting across pod replicas
- **Azure Key Vault** — secrets management (Postgres + Redis passwords)
- **Kubernetes** — container orchestration

## Prerequisites
- Docker + Kubernetes (kind or Docker Desktop)
- Azure CLI + an Azure Key Vault
- An Azure Service Principal with Key Vault Secrets User role

## Setup
1. Create secrets in Azure Key Vault:
```bash
az keyvault secret set --vault-name YOUR_VAULT --name chat-app-postgres-password --value YOUR_PG_PASSWORD
az keyvault secret set --vault-name YOUR_VAULT --name chat-app-redis-password --value YOUR_REDIS_PASSWORD
```

2. Create the Kubernetes secret for the Service Principal:
```bash
kubectl create secret generic azure-keyvault-sp \
  --from-literal=clientid=YOUR_SP_CLIENT_ID \
  --from-literal=clientsecret=YOUR_SP_CLIENT_SECRET
```

3. Update `chat-deployment.yaml` and `postgres-deployment.yaml` with your vault name and tenant ID.

4. Deploy:
```bash
kubectl apply -f postgres-deployment.yaml
kubectl apply -f redis-deployment.yaml  
kubectl apply -f chat-deployment.yaml
kubectl apply -f service.yaml
```

5. Access:
```bash
kubectl port-forward service/docker-demo-service 8080:80
```
Open http://localhost:8080
