-- s4-09: a scan's key is the page's whole URL, origin included. Every row stored before is keyed
-- by a path and a query alone, so it would never be asked again; the next request scans afresh.
DELETE FROM `axe_results`;
