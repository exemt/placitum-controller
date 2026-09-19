# Placitum License Agreement

Version 2.0 of 19 September 2026

This agreement (the **Agreement**) is made between the rights holder of the Placitum product (the
**Licensor**) and the person or organization that installs, runs, studies or modifies the Software
(the **Licensee**). By installing the Software, accepting the Agreement in the control panel or
using the source code of the Software, the Licensee accepts the Agreement in full. A Licensee who
does not agree with the terms may not use the Software.

> **In short.** This box is a convenience summary and is not part of the Agreement.
>
> - Placitum has two parts. The open core (the nginx module, the controller with its control panel,
>   the installer and the services around them) is under the Apache License 2.0, and this Agreement
>   does not cover it. The inspectors are covered by this Agreement.
> - The inspectors are free for your own needs: all of them, in any number of copies, with no limit
>   on load, protected applications or nodes.
> - The source code is open: it may be studied and modified within the same free use.
> - Not free: Paid Features, which are integrations with corporate systems (today: logins through
>   LDAP and a Windows domain, export of events to a SIEM), Feeds (updates of lists and rules from
>   the Licensor) and any commercial services around the inspectors (installing, configuring,
>   maintaining, supporting or operating them for others, or offering protection by them as a
>   service). These require a Commercial License, usually a subscription.
> - A function that was free in the copy you received stays free in that copy.
> - Free use comes with no support, no warranty and no liability.
> - Licenses for third-party components and databases (IP databases, rule sets, models) are the
>   Licensee's responsibility.
> - The inspectors may not be redistributed, resold or passed off as one's own.

## 1. Definitions

**Placitum** means the Placitum software suite as a whole: the Open Core and the Software.

**Open Core** means the Placitum components the Licensor publishes under the Apache License 2.0:
the nginx module and the node agent, the controller with its control panel and API, the keeper
service, the log store, the key service, the network directory, the monitoring agents, the shared
libraries, the installer with its deployment and image build scripts, and their documentation. The
Open Core is used under the Apache License 2.0. This Agreement does not cover the Open Core and
does not restrict its use.

**Software** means the Placitum inspectors (including the IP filter, traffic rules, second factor,
captcha, specification admission, counter, classifier, response rewriting, cookies, automatic
actions) and any other Placitum component the Licensor ships together with the text of this
Agreement, with their documentation, both as source code and as built images and executables. The
Open Core, Third-Party Components and Feeds are not part of the Software.

**Installation** means one Placitum controller together with all nginx nodes it delivers
configuration to and the inspectors that work with it.

**Own Needs** means use of the Software by the Licensee to protect web applications and APIs that
the Licensee itself operates for its own activity, including the Licensee's commercial activity
that is not related to Placitum. An application the Licensee operates for its own customers is
still the Licensee's own application. Protecting applications operated by third parties is not Own
Needs.

**Commercial Services** means any activity for remuneration or other commercial benefit that
consists in or is connected with installing, configuring, maintaining, supporting, operating or
hosting the Software for third parties, including offering protection by the Software as a service,
consulting on the Software and reselling it.

**Paid Features** means the functions of the Software, and the separate components of the Software,
that section 3 lists or that the Licensor marks as paid in the documentation of the Software or in
the control panel.

**Educational Organization** means an organization of any country whose principal activity is
teaching: a school, college, vocational school, university, institute, academy, training centre,
kindergarten, library or a research organization attached to them, public or private, regardless of
form of ownership.

**Feeds** means updatable content the Licensor may publish for Placitum: lists of addresses,
networks, autonomous systems, bots and other unwanted sources, reputation data, rule sets,
signatures, machine-learning models and similar material, and the service that delivers updates of
such content.

**Third-Party Components** means software, data and services created by parties other than the
Licensor that Placitum uses, includes in its images or scripts, or is designed to work with, such
as nginx, Coraza, the OWASP Core Rule Set, NATS, Redis, ClickHouse, PostgreSQL, MinIO, HAProxy, geo
and IP databases (for example MaxMind), IP reputation sources, machine-learning models and
programming-language libraries.

**Commercial License** means a separate written contract between the Licensor and the Licensee,
including a subscription, that permits use of the Software beyond the terms of this Agreement.

## 2. Free license

Subject to the Agreement, the Licensor grants the Licensee a non-exclusive, worldwide, royalty-free
and non-transferable license to:

1. install and run the Software for Own Needs in any number of Installations, with no limit on
   load, on the number of protected applications and nodes, or on the number of inspectors and
   their copies;
2. make copies of the Software needed to install, back up and operate it within the Licensee's
   organization;
3. study the source code of the Software;
4. modify the source code of the Software and run modified versions on the same terms as the
   unmodified Software;
5. hand the Software and its modified versions to a contractor who installs or operates an
   Installation on behalf of the Licensee, provided the contractor is bound not to use or distribute
   the Software otherwise. Whether the contractor itself needs a Commercial License is governed by
   section 4.

The free license does not cover Paid Features (section 3), Commercial Services (section 4) or Feeds
(section 10). All rights not expressly granted are reserved by the Licensor.

## 3. Paid features

3.1. On the date of this version of the Agreement the Paid Features are:

1. logins through external user directories in the second factor inspector: the `ldap` and `ntlm`
   providers (LDAP, Active Directory, a Windows domain);
2. export of events to external systems such as a SIEM, shipped as a separate component.

3.2. Using a Paid Feature requires a Commercial License or the Licensor's written permission.
Everything else in the Software is covered by the free license under section 2.

3.3. The source code of Paid Features is open on the terms of section 7: it may be studied and
modified. Running a Paid Feature, modified or not, requires a Commercial License, except as
provided in clause 3.5 and section 5.

3.4. The Licensor may add Paid Features in new versions of the Software. A function that the free
license covered in a copy of the Software the Licensee received stays covered by the free license
in that copy and in the Licensee's modified versions of it.

3.5. To evaluate a Paid Feature, the Licensee may use it without a Commercial License for 30
(thirty) calendar days from its first use in an Installation.

3.6. The Software may run a Paid Feature without checking for a Commercial License. The absence of
a technical restriction does not permit the use of Paid Features without a Commercial License. On
the Licensor's request the Licensee confirms in writing which Paid Features its Installations use.

## 4. Own needs and commercial services

4.1. The free license covers Own Needs only.

4.2. Providing Commercial Services requires a Commercial License or the Licensor's written
permission. The requirement applies to the party providing the services. The customer of such
services keeps its own free license under section 2 if it otherwise qualifies.

4.3. Installation, configuration and maintenance of the Software by the Licensee's own employees for
the Licensee's Installations is Own Needs.

4.4. Offering protection by the Software as a service to third parties (for example, by a hosting
provider, a managed security provider or a system integrator) is Commercial Services.

## 5. Educational organizations

5.1. Educational Organizations of any country may use the Paid Features free of charge on the terms
of section 2. Feeds and support are not included.

5.2. The exemption covers the organization's own information systems, including systems a
contractor installs and operates for it. Section 4 still applies to the contractor.

5.3. The exemption does not extend to companies for which education is the market for their own
product or service (for example, commercial online-course platforms), unless the company itself is
an Educational Organization.

5.4. The Licensor may request confirmation of the organization's status; the Licensee provides it
within a reasonable time.

## 6. Commercial license

6.1. Using Paid Features, except as provided in clause 3.5 and section 5, receiving Feeds and
providing Commercial Services require a Commercial License or the Licensor's written permission.

6.2. The terms of a Commercial License, such as price, term, number of Installations, Paid Features,
support and Feeds, are agreed separately. A Commercial License may take the form of a subscription.
Written permission of the Licensor given by e-mail is equivalent to a Commercial License to the
extent stated in it.

6.3. A Commercial License supplements this Agreement and does not replace it: whatever the
Commercial License does not expressly permit remains governed by the Agreement.

## 7. Source code: study and modification

7.1. The source code of the Software is open for study by anyone.

7.2. The Licensee may modify the source code and build its own versions of the Software. Modified
versions remain the Software within the meaning of the Agreement: the same permissions and the same
restrictions, including sections 3 and 4, apply to them.

7.3. All copies and modified versions of the Software keep the authorship notices and the text of
this Agreement.

7.4. The Licensor is not obliged to accept, support or maintain changes made by the Licensee.

## 8. What is prohibited

Without the Licensor's separate written permission the Licensee may not:

1. distribute the Software or its modified versions to third parties, including selling, renting,
   sublicensing, publishing openly or bundling into another product, other than handing it to a
   contractor under clause 2.5;
2. provide Commercial Services without a Commercial License;
3. use Paid Features or Feeds without a Commercial License, except as provided in clause 3.5 and
   section 5;
4. remove or hide the authorship notices or the text of this Agreement in the Software, or pass the
   Software off as its own development, including under a different name;
5. use the Software to break the law or to infringe the rights of third parties.

## 9. No support under the free license

9.1. Under the free license the Licensor provides no support of any kind: it is not obliged to
answer questions, fix errors, publish updates, review the Licensee's configuration or help with
installation, operation or incidents.

9.2. Support, response times and error fixing are provided only under a Commercial License and to
the extent stated in it.

9.3. Anything the Licensor nevertheless does for a Licensee under the free license is done
voluntarily, creates no obligation to continue and does not change section 17 or 18.

## 10. Feeds and updates

10.1. Feeds are not part of the free license. Address and network lists, bot lists, lists of
unwanted sources, rule sets, signatures, models and their updates are maintained by the Licensee on
its own.

10.2. Feeds, their delivery and automatic updating are provided only under a Commercial License and
to the extent stated in it. The Licensor may make automatic updating unavailable or disable it for
Installations without a Commercial License.

10.3. Feeds published by the Licensor may include Third-Party Components; section 11 applies to
them.

## 11. Third-party components and databases

11.1. Third-Party Components are used under their own licenses and terms, and this Agreement does
not change those terms. The Licensor grants no rights to Third-Party Components.

11.2. Where a Third-Party Component or database requires its own license, registration, key,
subscription or payment (for example, geo and IP databases, IP reputation sources, commercial rule
sets, models), obtaining it, paying for it and complying with its terms is the Licensee's
obligation. The Licensee uses such components under its own agreements with their providers.

11.3. The Licensor is not liable for the availability, accuracy or terms of Third-Party Components
or for the consequences of their use.

## 12. Data processed by Placitum

12.1. Placitum processes the traffic of the protected applications, including personal data
contained in it. The Licensee determines the purposes and means of such processing and is
responsible for compliance with data protection, privacy and other applicable laws, including
informing users where required.

12.2. The Licensor has no access to data processed by the Licensee's Installations and does not
receive it, unless the Licensee sends it to the Licensor on its own initiative or connects an
Installation to a service of the Licensor. What such a service receives is stated in the terms of
that service.

## 13. Control panel and acceptance

13.1. On the first entry the control panel the Licensor ships shows the text of the Agreement and
asks to accept it. Pressing the accept button is the consent of the person working with the panel
to the terms of the Agreement on behalf of the organization in whose interest the Installation is
operated.

13.2. The acceptance mark is stored in the browser. Its absence in another browser or after
clearing browser data does not mean the Agreement has not been accepted: it is accepted from the
first use of the Software.

13.3. When a new version of the Agreement is released, the panel shows it again. Until the new
version is accepted, the Installation keeps running on the terms of the version the copy of the
Software came with.

## 14. Trademarks

The name "Placitum", the logo and the visual identity belong to the Licensor. Neither this
Agreement nor the Apache License 2.0 of the Open Core grants the right to use them other than to
state that an Installation is built on Placitum.

## 15. Contributions

By submitting fixes, additions or other materials to the Licensor for inclusion in the Software, the
Licensee grants the Licensor a perpetual, irrevocable, worldwide and royalty-free right to use,
modify, distribute and sublicense those materials on any terms, including commercial ones. The
Licensee confirms it is entitled to submit such materials. Contributions to the Open Core are
governed by the Apache License 2.0.

## 16. Security research

Studying the Software for vulnerabilities in the Licensee's own Installations is permitted. The
Licensee is asked to report a found vulnerability to the Licensor before making it public and to
give the Licensor a reasonable time to fix it.

## 17. No warranty

The Software and its source code are provided "as is", without warranties of any kind, express or
implied, including fitness for a particular purpose, absence of errors, uninterrupted operation,
compatibility with the Licensee's environment and protection from any attacks. The Licensee assesses
the suitability of the Software and bears the risk of its use. The Software is under development:
some functions may be incomplete, and the Licensor is not obliged to complete or keep them.

## 18. Limitation of liability

18.1. Under the free license the Licensor bears no liability for the operation of the Software or
its source code and for damages of any kind arising from their use or inability to use them: lost
profit, loss of data, business interruption, reputational harm, blocking of legitimate users, or the
consequences of attacks the Software did not stop.

18.2. Under a Commercial License the Licensor's liability is defined by that license and, unless it
states otherwise, is limited to the amount the Licensee paid under it over the last twelve months.

18.3. Nothing in the Agreement limits liability that cannot be limited under applicable law.

## 19. Indemnity

The Licensee indemnifies the Licensor against third-party claims arising from the Licensee's use of
the Software, including claims of users of the protected applications, claims related to data
processing and claims related to Third-Party Components used by the Licensee.

## 20. Term and termination

20.1. The Agreement is effective from acceptance until termination.

20.2. The Agreement terminates automatically if the Licensee breaches it and fails to cure the
breach within 30 (thirty) calendar days after the Licensor's written notice. For breaches of
section 8 the Licensor may terminate the Agreement immediately.

20.3. Upon termination the Licensee stops using the Software and deletes its copies. Sections 11,
12, 14, 15, 17, 18, 19, 22 and 23 survive termination. Termination does not affect the Licensee's
rights to the Open Core under the Apache License 2.0.

## 21. Versions of the Agreement and of the Software

21.1. The Licensor may publish new versions of the Agreement. A copy of the Software received with a
particular version of the Agreement is used on the terms of that version. A new version applies to
the Licensee from the moment it is accepted in the control panel or a new copy of the Software is
received.

21.2. The Licensor may change the Software, release new versions on different terms, and stop
developing or distributing it. The Licensor is not obliged to publish updates.

21.3. This version replaces version 1.1 of 12 September 2026, which covered the whole of Placitum
and limited free use by a load threshold. A copy of Placitum received with version 1.1 may still be
used on the terms of version 1.1. Starting with the copies that come with version 2.0, the Open Core
is published under the Apache License 2.0 and the load threshold no longer applies.

## 22. General provisions

22.1. If any provision of the Agreement is found invalid, the remaining provisions stay in force,
and the invalid provision is replaced by a valid one closest in meaning.

22.2. The Licensee may not assign the Agreement or its rights under it without the Licensor's
written consent. The Licensor may assign the Agreement to a successor of the rights to the Software.

22.3. The Licensor's failure to enforce a provision is not a waiver of it.

22.4. The Licensee complies with export control and sanctions laws applicable to it when using the
Software.

22.5. Notices under the Agreement are given by e-mail to the address in the Contacts section and to
the address the Licensee provided to the Licensor.

22.6. The Agreement, together with a Commercial License where one exists, is the entire agreement
between the parties regarding the Software.

## 23. Governing law and language

23.1. The Agreement is governed by the law of the country in which the Licensor is registered or
permanently resides at the time a dispute arises. Disputes are resolved at the Licensor's location
unless mandatory rules of law require otherwise.

23.2. The Agreement is written in English, and the English text governs its interpretation.
Translations into other languages, including the Russian text shipped with the Software, are
provided for convenience; in case of discrepancy the English text prevails.

## Contacts

Questions about a Commercial License, Paid Features, permission to provide Commercial Services,
Feeds, support and confirmation of an organization's status: support@plcwaf.com.
