const { TableClient } = require('@azure/data-tables');
const { v4: uuidv4 } = require('uuid');

const TABLE_NAME = process.env.AZURE_TABLE_NAME || 'Tasks';
const LABELS_TABLE_NAME = process.env.AZURE_LABELS_TABLE_NAME || 'Labels';
const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING || 'UseDevelopmentStorage=true';

if (!process.env.AZURE_STORAGE_CONNECTION_STRING) {
  console.warn(
    'AZURE_STORAGE_CONNECTION_STRING is not set. Falling back to the local Azurite emulator connection string.'
  );
}

const tableClient = TableClient.fromConnectionString(connectionString, TABLE_NAME, {
  allowInsecureConnection: true,
});

const labelsTableClient = TableClient.fromConnectionString(connectionString, LABELS_TABLE_NAME, {
  allowInsecureConnection: true,
});

async function ensureTableExists() {
  try {
    await tableClient.createTable();
  } catch (err) {
    if (err.statusCode !== 409) throw err;
  }
  try {
    await labelsTableClient.createTable();
  } catch (err) {
    if (err.statusCode !== 409) throw err;
  }
}

function toTask(entity) {
  return {
    date: entity.partitionKey,
    id: entity.rowKey,
    title: entity.title,
    time: entity.time || '',
    category: entity.category || 'personal',
    labelId: entity.labelId || null,
    completed: !!entity.completed,
    createdAt: entity.createdAt,
    completedAt: entity.completedAt || null,
  };
}

async function getTasksByDate(date, category) {
  const tasks = [];
  const entities = tableClient.listEntities({
    queryOptions: { filter: `PartitionKey eq '${date}' and category eq '${category}'` },
  });
  for await (const entity of entities) tasks.push(toTask(entity));
  tasks.sort(
    (a, b) => (a.time || '99:99').localeCompare(b.time || '99:99') || a.createdAt.localeCompare(b.createdAt)
  );
  return tasks;
}

async function getTasksInRange(start, end, category) {
  const tasks = [];
  const entities = tableClient.listEntities({
    queryOptions: {
      filter: `PartitionKey ge '${start}' and PartitionKey le '${end}' and category eq '${category}'`,
    },
  });
  for await (const entity of entities) tasks.push(toTask(entity));
  return tasks;
}

async function createTask(date, { title, time, category, labelId }) {
  const now = new Date().toISOString();
  const entity = {
    partitionKey: date,
    rowKey: uuidv4(),
    title,
    time: time || '',
    category: category || 'personal',
    labelId: labelId || '',
    completed: false,
    createdAt: now,
  };
  await tableClient.createEntity(entity);
  return toTask(entity);
}

async function updateTask(date, id, updates) {
  const entity = { partitionKey: date, rowKey: id };
  if (typeof updates.title === 'string') entity.title = updates.title;
  if (typeof updates.time === 'string') entity.time = updates.time;
  if (typeof updates.labelId === 'string') entity.labelId = updates.labelId;
  if (typeof updates.completed === 'boolean') {
    entity.completed = updates.completed;
    entity.completedAt = updates.completed ? new Date().toISOString() : '';
  }
  await tableClient.updateEntity(entity, 'Merge');
  const updated = await tableClient.getEntity(date, id);
  return toTask(updated);
}

async function deleteTask(date, id) {
  try {
    await tableClient.deleteEntity(date, id);
  } catch (err) {
    if (err.statusCode !== 404) throw err;
  }
}

// Moves every still-incomplete task dated before `today` (in this category) to `today`,
// so nothing gets silently left behind on a day that's already passed. Runs lazily whenever
// the app is opened, since there's no scheduled job to do this at midnight server-side.
async function rolloverIncompleteTasks(category, today) {
  const stale = [];
  const entities = tableClient.listEntities({
    queryOptions: { filter: `category eq '${category}' and completed eq false and PartitionKey lt '${today}'` },
  });
  for await (const entity of entities) stale.push(entity);

  let movedCount = 0;
  for (const entity of stale) {
    const newEntity = {
      partitionKey: today,
      rowKey: entity.rowKey,
      title: entity.title,
      time: entity.time || '',
      category: entity.category,
      labelId: entity.labelId || '',
      completed: false,
      createdAt: entity.createdAt,
    };
    try {
      await tableClient.createEntity(newEntity);
    } catch (err) {
      if (err.statusCode !== 409) throw err;
      // Already moved by a concurrent request; fall through to clean up the old row.
    }
    await deleteTask(entity.partitionKey, entity.rowKey);
    movedCount += 1;
  }
  return movedCount;
}

function toLabel(entity) {
  return {
    category: entity.partitionKey,
    id: entity.rowKey,
    name: entity.name,
    color: entity.color,
  };
}

async function getLabels(category) {
  const labels = [];
  const entities = labelsTableClient.listEntities({
    queryOptions: { filter: `PartitionKey eq '${category}'` },
  });
  for await (const entity of entities) labels.push(toLabel(entity));
  labels.sort((a, b) => a.name.localeCompare(b.name));
  return labels;
}

async function createLabel(category, { name, color }) {
  const entity = {
    partitionKey: category,
    rowKey: uuidv4(),
    name,
    color,
  };
  await labelsTableClient.createEntity(entity);
  return toLabel(entity);
}

async function deleteLabel(category, id) {
  try {
    await labelsTableClient.deleteEntity(category, id);
  } catch (err) {
    if (err.statusCode !== 404) throw err;
  }
}

module.exports = {
  ensureTableExists,
  getTasksByDate,
  getTasksInRange,
  createTask,
  updateTask,
  deleteTask,
  rolloverIncompleteTasks,
  getLabels,
  createLabel,
  deleteLabel,
};
