type Database = {
  query(sql: string, values?: readonly unknown[]): Promise<unknown[]>;
};
type Request = { query: { name: string } };

export function findAccount(database: Database, request: Request) {
  const query = "SELECT id FROM accounts WHERE name = '" + request.query.name + "'";
  return database.query(query);
}
