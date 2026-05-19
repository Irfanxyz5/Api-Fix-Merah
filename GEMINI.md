# Project Conventions

## API Responses
- All JSON responses must be pretty-printed for readability.
- The `res.json` method in serverless handlers is overridden to use `JSON.stringify(data, null, 2)`.
- When adding new endpoints, ensure the following block is at the top of the handler:
  ```javascript
  res.json = (data) => {
    res.setHeader('Content-Type', 'application/json');
    return res.send(JSON.stringify(data, null, 2));
  };
  ```
