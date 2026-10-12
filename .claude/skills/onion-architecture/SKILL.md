---
name: onion-architecture
description: Apply DevDigest onion architecture when editing server routes, services, domain logic or adapters.
---

Routes validate and obtain workspace context, then call services. Services depend on domain contracts and container-provided ports. Repositories own workspace-scoped SQL. Put Git, GitHub, inference, tokenization and filesystem adapters on the outer edge. Dependencies point inward. Never import a concrete adapter directly into a route. Keep reviewer-core free of database and filesystem I/O.
