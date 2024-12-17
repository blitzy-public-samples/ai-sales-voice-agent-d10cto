---
name: Bug Report
about: Create a report to help us improve the DocShield AI Voice Agent worker service
title: '[BUG] '
labels: bug
assignees: ''
---

## Bug Description
### Summary
<!-- Provide a clear and concise description of the bug -->

### Expected Behavior
<!-- What should have happened? -->

### Actual Behavior
<!-- What happened instead? -->

### Impact Assessment
**Severity Level:** <!-- Critical/High/Medium/Low -->
**Business Impact:** <!-- Describe business impact -->
**Affected Scope:** <!-- Number of affected calls/campaigns -->

## Environment
### System Information
- Node.js Version:
- Environment: <!-- production/staging/development -->
- Worker Dyno: <!-- type and specifications -->
- Redis Queue Config:
- MongoDB Cluster:
- LiveKit/OpenAI API Version:

### Configuration Details
<!-- List any relevant configuration settings -->
```yaml
# Add relevant configuration (sanitized)
```

## Voice Agent Context
### Call State
- Current State:
- Phone Tree Step:
- Circuit Breaker Status:

### Conversation Details
<details>
<summary>Conversation Transcript (sanitized)</summary>

```
# Add sanitized transcript
```
</details>

### AI Response
- Recording URL (if available):
- Model Response:
- Sales Coach Feedback:

## Reproduction Steps
### Test Scenario
1. <!-- Step 1 -->
2. <!-- Step 2 -->
3. <!-- Step 3 -->

### Test Data
- Campaign ID (sanitized):
- Contact Details (sanitized):
- Queue Job Config:
```json
{
  // Add sanitized job configuration
}
```

### Voice Agent Prompt
```
# Add voice agent prompt used
```

## Error Information
### Error Details
- Error Message:
- LogTail Error ID:
- Error Frequency:

<details>
<summary>Stack Trace</summary>

```
# Add stack trace
```
</details>

### Recovery Information
- Recovery Attempts:
- Backoff Strategy:
- Related Errors:

---

### Bug Verification Checklist
- [ ] Error reproducible in staging environment
- [ ] Complete logs collected and attached
- [ ] Impact severity assessed and documented
- [ ] Security implications checked and documented
- [ ] Data privacy compliance verified
- [ ] Performance impact measured

### System Impact Checklist
- [ ] Voice agent functionality affected (documented)
- [ ] Database integrity verified
- [ ] Queue processing impact assessed
- [ ] Call recording storage impact checked
- [ ] API rate limits verified
- [ ] Resource utilization checked
- [ ] Circuit breaker status verified

### Monitoring Data Checklist
- [ ] LogTail alerts reviewed and attached
- [ ] Error patterns analyzed and documented
- [ ] Performance metrics checked
- [ ] Circuit breaker status verified
- [ ] API response times documented
- [ ] Resource utilization graphs attached
- [ ] Related incident reports linked

### Additional Context
<!-- Add any other context about the problem here -->

### Screenshots/Logs
<!-- If applicable, add screenshots or logs to help explain your problem -->