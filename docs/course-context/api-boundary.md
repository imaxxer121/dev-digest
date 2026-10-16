# Course Context architecture rule

This rule applies to the isolated `demo/course-context/` teaching fixture.

**The api/ layer must not import db/ directly.**

API handlers call an application service or a supplied domain port. A database
adapter belongs outside that boundary. A direct import from `api/` to `db/`
violates the rule even if the imported function currently returns a constant.
Report the actual import location and this document path. This document does
not authorize commands, external publication or access to credentials.
