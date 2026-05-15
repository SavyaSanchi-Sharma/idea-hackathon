# the ground reality 
- so the current problem is that bank services like union bank has several digital services like mobile banking internet banking upi neft rtgs etc etc 
    -  each of these services also has n number of microservices that commumnicate over APIs
    - realistically it has 5k to 15k apis running across the infra 
    - in that also they have internal and external communicating apis 
        - internal is for team to team communication 
        - external is for rbi , customers etc etc 
    - so what happens is that banking tech guys builds the system across years and years so when the bank upgrades system they usually do not remove old apis immediately because those apis are still at work these apis are kept untouched for years not removed not updated after some time their wikis and docs gets lost 
        - suppose an api is created in 2008 then it is used over the years and in 2019 the creater leaves the job, no one knows the exact codebase information as the documents might be there or might not be there this api still works with the security standards of 2008 and it shouldn't be hindered because if the api got messed up it will mess the whole system THIS IS ZOMBIE APIs
    - now if the attacker found out that this zombie api exist and is of old authentication no rate limits and is returning real data than the bank system can be attacked 

# The Depth of the problem: Why this is a problem 
- this zombie api is invisible to the developer it is running somehow but no one knows how
- this still has full access so it is more deadly as it is more prone to attacks and the attacker can get to all the details with this single vulnerability 
- it is easily findable by the attackers as they run the automated scans on the endpoints and these can find the zombie which a bank can't find 

# how it is handled today 
- banking systems rely on manual documentation by the developers 
- Active scanning tools like burp and postman these probe an ip range looking for endpoints but the problem is they only finds what it responds to they miss internal only apis and can't tell if they are zombies or legitimate risky as they can generate production alerts 
- compliance audits which is done once or twice an year by the time auditor will find the zombie it already might got attacked 
- SIEM / SOC tools — these monitor for attacks on known assets, not for discovering unknown assets. They're defenders of the inventory, not auditors of the inventory.

# what the ps is actually asking for 
## dicovery
- passive traffic ovbservation -> watch what apis are actually being called in production sources may be api gateway logs, network flow data, service mesh telemetry reverse proxy logs load balancer logs. here the system doesn't send any probs it only observes the traffic 


- regestry cross referencing -> take the bank's official inventory of wwhat should exist the openapi specs, the cmdb entries and diff it against techniquer A observed reality anything is observed but not registered = shadow api 

`a shadow api is an undocumented api still actively used while a zombie api is an old deprecated api that should be dead but is still accessible`


- static code inspection-> scan code repositories and deployment artifacts to find  endpoints that are deploed but unused this catches the case where the code is live in production  but nothing calls it tools needed like ast parsing for route decoraters parsing of openapi files in repos parsing of K8s ingress rules 

- these all would be the data which i will get from multiple sources and the conditions now i have to classify it as active shadow and zombie 

## intelligence layer  
- thise is the ai part from the data i have to find out how dangerous it is 

``` txt
The required signals to gather per endpoint:
Data sensitivity — what data does this endpoint touch? Customer PII (PAN, Aadhaar, address)? Financial data (account balance, transaction history)? Authentication material (passwords, OTPs, biometric hashes)? KYC documents? This requires either looking at the endpoint's database queries (if accessible), inferring from the endpoint name and parameters, or analyzing actual response payloads.
Authentication posture — does it require auth? What kind? Modern (OAuth 2.0, mTLS, JWT with short expiry)? Legacy (basic auth, static API keys, no auth)? Is rate limiting in place? IP whitelisting? Is there MFA where appropriate?
Blast radius — if this endpoint were compromised, what's the maximum damage? How many records can it return per call? Can it modify state (write/delete) or only read? What downstream systems does it touch? Does it have access to high-value systems like core banking or NPCI rails?
Staleness signals — when was the code last modified? Last deployed? When was the dependency tree last patched? Are there known CVEs in the libraries it uses? Is the original author still at the company?
Threat intelligence overlay — does this endpoint's pattern match known CVE patterns (e.g., does it look like CVE-2024-XXXX)? Does it map to OWASP API Security Top 10 categories (Broken Object Level Authorization, Broken Authentication, Unrestricted Resource Consumption, etc.)?
The Gen AI's job is to synthesize all of this into a natural-language threat narrative and a numerical risk score. The threat narrative is for humans (CISO, security analysts) to read and act on. The risk score is for the automation layer (Phase 3) to make decisions on. Both must be explainable — the score must decompose into the underlying signals so the bank can defend the decision in an audit.
This is also where prioritization happens. A bank with 800 zombies cannot remediate all 800 tomorrow. The risk scores must produce a triage queue: "fix these 12 critical zombies this week, these 47 medium ones this month, monitor the rest."
```

## action 
- graduated risk proportional automated responses with appropriate human gates 
    - low risk -> monitor and quariantine endpoint stays live but the system tightemns its grip rate limits are lowered more detailed logs 
    - medium risk -> detailed solution of the risk 
    - critical risk -> full block 

- Compliance artifact generation: Every action and every discovered endpoint generates audit-trail entries. The system produces formal reports aligned to RBI's Master Directions on IT Governance (the 2023 framework that explicitly mentions API security) and PCI-DSS Section 6 (secure software development). These reports are what the bank shows to RBI inspectors and PCI auditors.

``` txt 

the ps emphasizes on continuous discovery this is the structural requirement the system runs continuously 
```
``` txt
Layer 5: What the PS implicitly demands beyond the explicit text
Reading between the lines of the PS, there are several requirements that aren't stated but will absolutely be judged on:
Banking domain authenticity. This is for Union Bank. Generic security tooling won't impress. The system must speak banking: UPI, IMPS, NEFT, RTGS, KYC, AML, NPCI, RBI, PCI-DSS. The endpoint names in demos must look real. The threat scenarios must reference real banking attack patterns (BIN attacks, mule account flows, OTP interception).
Scale credibility. A bank's API traffic is millions of calls per minute. Pure-Python ingestion won't pass the smell test. This is exactly why your Rust+Python hybrid is well-suited.
Regulatory rigor. RBI is currently (2024-25) pushing hard on API security governance. The PS specifically mentions RBI cybersecurity guidelines and PCI-DSS. The compliance reporting cannot be hand-wavy — it must map to specific control numbers in real frameworks.
Privacy preservation. A system that scans a bank's APIs has access to incredibly sensitive data flows. The PS doesn't say this, but judges will ask: how does the system avoid becoming itself a privacy liability? Answers must include PII masking, data minimization, role-based access to the dashboard, audit trails on who saw what.
Non-disruption guarantee. Banks operate 24/7 critical infrastructure. Any tool that scans APIs cannot risk taking down payment systems. Hence "passive" discovery is emphasized over active scanning — and any defensive action (especially Tier 3 blocks) must be reversible.
Deployment realism. The system must be deployable into a real bank's environment. That means containerized, supporting on-prem deployment (banks have strict data residency rules), integrable with existing API gateways and SIEMs, and operable by the bank's existing security team without exotic skills.
Layer 6: The business impact framing
The PS closes with impact statements. Let me decode why each one is there:

"Eliminates the single biggest blind spot" — this positions the product as solving a category problem, not a feature problem. Judges reward category-defining solutions.
"Reduces mean time to detect from months to minutes" — quantified outcome. Always include this in your pitch.
"RBI IT governance compliance" — regulatory tailwind. Banks must solve this, not just want to. This is a budget-unlock argument.
"Prevents data breaches through forgotten endpoints" — risk-avoidance framing. The math here: a single banking breach in India costs ₹120-200 crore on average (RBI penalty + remediation + reputation). A tool that prevents one breach pays for itself many times over.
"Deployable across all PSBs as SaaS" — TAM expansion. There are 12 public sector banks in India. If ZombieHunter works at Union Bank, the same product works at SBI, PNB, Canara, etc. with minimal customization. Plus private banks, NBFCs, insurance, fintechs — anyone with a sprawling API estate.

``` 
























