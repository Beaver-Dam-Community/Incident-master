const test = require('node:test');
const assert = require('node:assert/strict');
require('../dist/scenarios.js');
const {scenarios, groups} = globalThis.BOOTH_CONTENT;

const expectedIds = ['CLOUD-CICD-01', 'CLOUD-EKS-01', 'CLOUD-WEB-01', 'CLOUD-GCP-01', 'CLOUD-AZURE-01'];

test('the catalog contains exactly five newly authored cloud incident scenarios', () => {
  assert.deepEqual(scenarios.map(scenario => scenario.id), expectedIds);
  assert.deepEqual(scenarios.map(scenario => scenario.code), ['A', 'B', 'C', 'D', 'E']);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups.map(group => [group.id, group.count]), [['cloud', 5]]);
  for (const scenario of scenarios) {
    assert.ok(scenario.title.length > 10, scenario.id);
    assert.ok(scenario.summary.length > 100, scenario.id);
    assert.ok(scenario.story.length > 100, scenario.id);
    assert.ok(scenario.cloudDiff.length > 60, `${scenario.id} explains how cloud response differs`);
  }
});

test('each scenario has six unique action ids, a complete recipe, and valid alternatives', () => {
  for (const scenario of scenarios) {
    const stepIds = scenario.steps.map(step => step.id);
    assert.equal(new Set(stepIds).size, 6, scenario.id);
    assert.deepEqual(scenario.recipe, stepIds, scenario.id);
    assert.deepEqual(scenario.accepted[0], scenario.recipe, scenario.id);
    for (const step of scenario.steps) {
      assert.ok(step.label.length > 20, `${scenario.id} ${step.id}`);
      assert.ok(step.shortLabel.length > 5, `${scenario.id} ${step.id}`);
      assert.ok(step.reason.length > 20, `${scenario.id} ${step.id}`);
    }
    for (const order of scenario.accepted) {
      assert.equal(order.length, 6, scenario.id);
      assert.deepEqual([...order].sort(), [...stepIds].sort(), scenario.id);
    }
  }
});

test('investigation discovers attacker persistence before the later removal action', () => {
  const cicd = scenarios.find(scenario => scenario.id === 'CLOUD-CICD-01');
  const web = scenarios.find(scenario => scenario.id === 'CLOUD-WEB-01');
  for (const scenario of [cicd, web]) {
    const investigation = scenario.steps.findIndex(step => step.id === 'investigate');
    const removal = scenario.steps.findIndex(step => step.id === (scenario === cicd ? 'remove-access' : 'replace-server'));
    assert.ok(investigation >= 0 && removal > investigation, scenario.id);
    assert.match(scenario.steps[investigation].reason, /새 계정|숨은 접속 기능|추가 접근 수단/);
  }
});

test('the EKS scenario explains its Kubernetes and cloud-permission link in plain language', () => {
  const eks = scenarios.find(scenario => scenario.id === 'CLOUD-EKS-01');
  assert.match(eks.title, /EKS/);
  assert.match(eks.summary, /Pod\)/);
  assert.match(eks.steps.find(step => step.id === 'trace-access').label, /클라우드 권한/);
  assert.match(eks.glossary, /Pod는/);
});

test('the Google Cloud and Azure incidents add non-AWS clouds and find persistence before removing it', () => {
  const gcp = scenarios.find(scenario => scenario.id === 'CLOUD-GCP-01');
  const azure = scenarios.find(scenario => scenario.id === 'CLOUD-AZURE-01');
  assert.match(gcp.topic, /Google Cloud/);
  assert.match(azure.topic, /Azure/);
  for (const scenario of [gcp, azure]) {
    const ids = scenario.steps.map(step => step.id);
    assert.ok(ids.indexOf('investigate') < ids.indexOf(scenario === gcp ? 'remove-access' : 'rebuild'), scenario.id);
    assert.match(scenario.steps[ids.indexOf('investigate')].reason, /새 키|새 계정/);
    assert.equal(scenario.accepted.length, 2, scenario.id);
  }
});
