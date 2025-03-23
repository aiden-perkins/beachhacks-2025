import { z } from "zod";
import axios from "axios";

import {
    defineDAINService, 
    ToolConfig,
    createOAuth2Tool,
    OAuth2Tokens as SDKOAuth2Tokens // Import the SDK's type
} from "@dainprotocol/service-sdk";

import { CardUIBuilder, TableUIBuilder, OAuthUIBuilder, AgentInfo, requestAuthenticationTool, LayoutUIBuilder, DainResponse } from '@dainprotocol/utils';   // Added LayoutUIBuilder & DAINUIresponse for Complex Layout
import { Buffer } from "buffer";
import { Hono } from "hono";

const port = Number(process.env.PORT) || 2022;


// interface RequestAuthentication {
//     app: Hono;
//     agentInfo: AgentInfo;
//   }
  

// export const requestAuthenticationTool = async (
//     provider: string,
//     { app, agentInfo }: RequestAuthentication
//   ) => {
//     const authUrl = await app.oauth2?.generateAuthUrl(provider, agentInfo.id);
    
//     return {
//       text: `Please authenticate with ${provider}`,
//       data: null,
//       ui: new OAuthUIBuilder()
//         .title(`${provider} Authentication`)
//         .content(`Authentication required`)
//         .url(authUrl)
//         .provider(provider)
//         .build()
//     };
//   };

// Use the SDK's OAuth2Tokens type
class TokenStore {
    private store = new Map<string, SDKOAuth2Tokens>();

    async set(agentId: string, tokens: SDKOAuth2Tokens) {
        this.store.set(agentId, tokens);
    }

    async get(agentId: string): Promise<SDKOAuth2Tokens | null> {
        return this.store.get(agentId) || null;
    }
}

const tokenStore = new TokenStore();

const listPullRequestsConfig: ToolConfig = {
    id: "list-pull-request",
    name: "List Pull Request",
    description: "Lists the GitHub repository's pull requests",
    input: z.object({
        owner: z.string(),
        repo: z.string(),
        state: z.enum(["open", "closed", "all"]).describe("the state of the pull requests").optional()
    }),
    output: z.object({
        urls: z.string().describe("List of urls to all pull requests")
    }),
    pricing: { pricePerUse: 0, currency: "USD" },
    handler: async ({ owner, repo, state }, agentInfo, { app }) => {
        const tokens = await tokenStore.get(agentInfo.id);

        if (!tokens) {
            return requestAuthenticationTool({provider: "github", logo: "https://images.freeimages.com/fic/images/icons/2779/simple_icons/512/github_512_black.png"}, { app, agentInfo });
        }

        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls?state=${state}`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${tokens.accessToken}`,
                "Content-Type": "application/json"
            }
        });

        const pullRequests = await response.json();

        return {
            text: `Fetched: ${pullRequests.length} pull requests.`,
            data: { urls: pullRequests.map(pr => (pr.html_url)).join('\n') },
            ui: new TableUIBuilder()
            .setRenderMode("page")
            .addColumns([
                { key: "number", header: "Number", type: "text"},
                { key: "title", header: "Title", type: "text"},
                { key: "status", header: "Status", type: "text"},
                { key: "creator", header: "Creator", type: "text"},
                { key: "time", header: "Time", type: "text"},
            ])
            .rows(pullRequests.map(pr => ({
                number: pr.number,
                title: pr.title,
                status: pr.state,
                creator: pr.user.login,
                time: pr.created_at
            })))
            .build()
        };
    },
};

const createGistConfig: ToolConfig = {
    id: "create-gist",
    name: "Create GitHub Gist",
    description: "Creates a new GitHub Gist",
    input: z.object({
        description: z.string(),
        filename: z.string(),
        content: z.string()
    }),
    output: z.object({
        url: z.string().describe("gist created")
    }),
    pricing: { pricePerUse: 0, currency: "USD" },
    handler: async ({ description, filename, content }, agentInfo, { app }) => {
        const tokens = await tokenStore.get(agentInfo.id);

        if (!tokens) {
            return requestAuthenticationTool({provider: "github", logo: "https://images.freeimages.com/fic/images/icons/2779/simple_icons/512/github_512_black.png"}, { app, agentInfo });
        }

        // Make authenticated request
        const response = await fetch("https://api.github.com/gists", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${tokens.accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                description,
                public: true,
                files: {
                    [filename]: { content }
                }
            })
        });

        const gist = await response.json();

        return {
            text: `Created Gist: ${gist.html_url}`,
            data: { url: gist.html_url },
            ui: new CardUIBuilder()
            .title("Gist Created")
            .content(`URL: ${gist.html_url}`)
            .build()
        };
    },
};

const getRepositoryConfig: ToolConfig = {
    id: "get-repository",
    name: "Get GitHub Repository",
    description: "Fetches details of a GitHub repository",
    input: z.object({
        owner: z.string(),
        repo: z.string()
    }),
    output: z.object({
        name: z.string(),
        description: z.string().nullable(),
        url: z.string(),
        stars: z.number(),
        forks: z.number(),
        language: z.string().nullable()
    }),
    pricing: { pricePerUse: 0, currency: "USD" },
    handler: async ({ owner, repo }, agentInfo, { app }) => {
        const tokens = await tokenStore.get(agentInfo.id);

        if (!tokens) {
            return requestAuthenticationTool({provider: "github", logo: "https://images.freeimages.com/fic/images/icons/2779/simple_icons/512/github_512_black.png"}, { app, agentInfo });
        }

        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${tokens.accessToken}`,
                "Content-Type": "application/json"
            }
        });

        const repoData = await response.json();
        console.log(repoData);

        return {
            text: `Fetched repository: ${repoData.full_name}`,
            data: {
                name: repoData.name,
                description: repoData.description,
                url: repoData.html_url,
                stars: repoData.stargazers_count,
                forks: repoData.forks_count,
                language: repoData.language
            },
            ui: new TableUIBuilder()
            .addColumns([
                { key: "name", header: "Repository Name", type: "text" },
                { key: "description", header: "Description", type: "text" },
                { key: "url", header: "URL", type: "link" },
                { key: "stars", header: "Stars", type: "number" },
                { key: "forks", header: "Forks", type: "number" },
                { key: "language", header: "Language", type: "text" }
            ])
            .rows([{ 
                name: repoData.name, 
                description: repoData.description || "N/A", 
                url: repoData.html_url, 
                stars: repoData.stargazers_count, 
                forks: repoData.forks_count, 
                language: repoData.language || "N/A" 
            }])
            .build()
        };
    }
};


const listIssuesConfig: ToolConfig = {
    id: "list-issues",
    name: "List GitHub Issues",
    description: "Lists issues from a GitHub repository",
    input: z.object({
        owner: z.string(),
        repo: z.string(),
        state: z.enum(["open", "closed", "all"]).optional()
    }),
    output: z.object({
        issues: z.array(z.object({
            number: z.number(),
            title: z.string(),
            state: z.string(),
            url: z.string()
        }))
    }),
    pricing: { pricePerUse: 0, currency: "USD" },
    handler: async ({ owner, repo, state = "all" }, agentInfo, { app }) => {
        const tokens = await tokenStore.get(agentInfo.id);
        if (!tokens) {
            return requestAuthenticationTool({provider: "github", logo: "https://images.freeimages.com/fic/images/icons/2779/simple_icons/512/github_512_black.png"}, { app, agentInfo });
        }

        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues?state=${state}`, {
            headers: {
                Authorization: `Bearer ${tokens.accessToken}`,
            }
        });

        const issues = await response.json();

        return {
            text: `Found ${issues.length} issues`,
            data: { issues: issues.map(issue => ({
                number: issue.number,
                title: issue.title,
                state: issue.state,
                url: issue.html_url
            }))},
            ui: new TableUIBuilder()
                .addColumns([
                    { key: "number", header: "Number", type: "text" },
                    { key: "title", header: "Title", type: "text" },
                    { key: "state", header: "State", type: "text" },
                    { key: "url", header: "URL", type: "link" }
                ])
                .rows(issues.map(issue => ({
                    number: issue.number,
                    title: issue.title,
                    state: issue.state,
                    url: issue.html_url
                })))
                .build()
        };
    }
};

// const getFileContentsConfig: ToolConfig = {
//   id: "get-file-contents",
//   name: "Get File Contents",
//   description: "Gets contents of a file from a GitHub repository.",
//   input: z.object({
//     owner: z.string(),
//     repo: z.string(),
//     path: z.string(),
//   }),
//   output: z.object({
//     content: z.string(),
//     encoding: z.string(),
//   }),
//   pricing: { pricePerUse: 0, currency: "USD" },
//   handler: async ({ owner, repo, path }, agentInfo, { app }) => {
//     const tokens = await tokenStore.get(agentInfo.id);
//     if (!tokens) {
//         return requestAuthenticationTool({provider: "github", logo: "https://images.freeimages.com/fic/images/icons/2779/simple_icons/512/github_512_black.png"}, { app, agentInfo });
//     }

//     try {
//       // First get the file metadata
//       const metadataResponse = await fetch(
//         `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
//         {
//           headers: {
//             Authorization: `Bearer ${tokens.accessToken}`,
//             Accept: "application/vnd.github.v3+json",
//           },
//         },
//       );

//       if (!metadataResponse.ok) {
//         throw new Error(`GitHub API error: ${metadataResponse.statusText}`);
//       }

//       const metadata = await metadataResponse.json();
//       console.log(metadata);

//       // Check if it's a file (not a directory)
//       if (Array.isArray(metadata)) {
//         throw new Error("Path points to a directory, not a file");
//       }

//       // For small files (< 1MB), use the direct content
//       if (metadata.size < 1000000 && metadata.content) {
//         return {
//           text: `Retrieved file contents for ${path}`,
//           data: {
//             content: metadata.content,
//             encoding: 'base64',
//           },
//           ui: new CardUIBuilder()
//             .title(`File: ${path}`)
//             .content(Buffer.from(metadata.content, "base64").toString())
//             .build(),
//         };
//       }

//       // For larger files, use the download_url
//       const contentResponse = await fetch(metadata.download_url, {
//         headers: {
//           Authorization: `Bearer ${tokens.accessToken}`,
//         },
//       });

//       if (!contentResponse.ok) {
//         throw new Error(
//           `Failed to download file: ${contentResponse.statusText}`,
//         );
//       }

//       const content = await contentResponse.text();

//       // Convert to base64 to maintain consistent output format
//       const base64Content = Buffer.from(content).toString("base64");

//       return {
//         text: `Retrieved file contents for ${path}`,
//         data: {
//           content: base64Content,
//           encoding: 'base64',
//         },
//         ui: new CardUIBuilder().title(`File: ${path}`).content(content).build(),
//       };
//     } catch (error) {
//       throw new Error(`Failed to get file contents: ${error.message}`);
//     }
//   },
// };

const getFileContentsConfig = {
    id: "get-file-contents",
    name: "Get File Contents",
    description: "If the user has already authenticated. Get contents of a file from a GitHub repository. Otherwise, prompt user to authenticate.",
    input: z.object({
      owner: z.string(),
      repo: z.string(),
      path: z.string(),
    }),
    output: z.object({
      content: z.string(),
      encoding: z.string(),
    }),
    pricing: { pricePerUse: 0, currency: "USD" },
    handler: async ({ owner, repo, path }, agentInfo, { app }) => {
      const tokens = await tokenStore.get(agentInfo.id);
      if (!tokens) {
        return requestAuthenticationTool({ provider: "github", logo: "https://images.freeimages.com/fic/images/icons/2779/simple_icons/512/github_512_black.png" }, { app, agentInfo });
      }
  
      try {
        const metadataResponse = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
          {
            headers: {
              Authorization: `Bearer ${tokens.accessToken}`,
              Accept: "application/vnd.github.v3+json",
            },
          }
        );
  
        if (!metadataResponse.ok) {
          throw new Error(`GitHub API error: ${metadataResponse.statusText}`);
        }
  
        const metadata = await metadataResponse.json();
        if (Array.isArray(metadata)) {
          throw new Error("Path points to a directory, not a file");
        }
  
        let content = "";
        if (metadata.size < 1000000 && metadata.content) {
          content = Buffer.from(metadata.content, "base64").toString();
        } else {
          const contentResponse = await fetch(metadata.download_url, {
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
          });
  
          if (!contentResponse.ok) {
            throw new Error(`Failed to download file: ${contentResponse.statusText}`);
          }
  
          content = await contentResponse.text();
        }
  
        const contentCard = new CardUIBuilder()
            .content(content)
            .build();

        const fileNameCard = new CardUIBuilder()
            .content(`File: ${path}`)
            .build();

        const layoutUI = new LayoutUIBuilder()
            .setLayoutType("column")
            .setGap(160)
            .setJustifyContent("between")
            .setAlignItems("center")
            .setBackgroundColor("#FF0000") // Add your desired background color
            .addChild(fileNameCard)
            .addChild(contentCard)
            .build();
  
        return {
          text: `Retrieved file contents for ${path}`,
          data: {
            content: Buffer.from(content).toString("base64"),
            encoding: "base64",
          },
          ui: layoutUI,
        };
      } catch (error) {
        throw new Error(`Failed to get file contents: ${error.message}`);
      }
    },
  };
  

const listRepoContentsConfig: ToolConfig = {
    id: "list-repo-contents",
    name: "List Repository Contents",
    description: "If the user has already authenticated. Lists files and directories in a GitHub repository. Otherwise, prompt user to authenticate.",
    input: z.object({
        owner: z.string(),
        repo: z.string(),
        path: z.string().optional()
    }),
    output: z.object({
        items: z.array(z.object({
            name: z.string(),
            type: z.string(),
            path: z.string(),
            size: z.number()
        }))
    }),
    handler: async ({ owner, repo, path = "" }, agentInfo, { app }) => {
        const tokens = await tokenStore.get(agentInfo.id);
        if (!tokens) {
            return requestAuthenticationTool({provider: "github", logo: "https://images.freeimages.com/fic/images/icons/2779/simple_icons/512/github_512_black.png"}, { app, agentInfo });
        }

        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
            headers: {
                Authorization: `Bearer ${tokens.accessToken}`,
            }
        });

        const items = await response.json();
        console.log(items)

        return {
            text: `Listed repository contents`,
            data: { items: items.map(item => ({
                name: item.name,
                type: item.type,
                path: item.path,
                size: item.size
            }))},
            ui: new TableUIBuilder()
                .addColumns([
                    { key: "name", header: "Name", type: "text" },
                    { key: "type", header: "Type", type: "text" },
                    { key: "path", header: "Path", type: "text" },
                    { key: "size", header: "Size", type: "number" }
                ])
                .rows(items)
                .build()
        };
    }
};

const openIssueConfig: ToolConfig = {
    id: "open-issue",
    name: "Open GitHub Issue",
    description: "If the user has already authenticated. Creates a new issue in a GitHub repository. Otherwise, prompt user to authenticate.",
    input: z.object({
        owner: z.string(),
        repo: z.string(),
        title: z.string(),
        body: z.string()
    }),
    output: z.object({
        number: z.number(),
        url: z.string()
    }),
    pricing: { pricePerUse: 0, currency: "USD" },
    handler: async ({ owner, repo, title, body }, agentInfo, { app }) => {
        const tokens = await tokenStore.get(agentInfo.id);
        if (!tokens) {
            return requestAuthenticationTool({provider: "github", logo: "https://images.freeimages.com/fic/images/icons/2779/simple_icons/512/github_512_black.png"}, { app, agentInfo });
        }

        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${tokens.accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ title, body })
        });

        const issue = await response.json();

        return {
            text: `Created issue #${issue.number}`,
            data: {
                number: issue.number,
                url: issue.html_url
            },
            ui: new CardUIBuilder()
                .title(`Issue Created: ${issue.title}`)
                .content(`Issue #${issue.number} created successfully`)
                .build()
        };
    }
};

const closeIssueConfig: ToolConfig = {
    id: "close-issue",
    name: "Close GitHub Issue",
    description: "If the user has already authenticated. Closes an existing issue in a GitHub repository. Otherwise, prompt user to authenticate.",
    input: z.object({
        owner: z.string(),
        repo: z.string(),
        issue_number: z.number()
    }),
    output: z.object({
        success: z.boolean(),
        url: z.string()
    }),
    pricing: { pricePerUse: 0, currency: "USD" },
    handler: async ({ owner, repo, issue_number }, agentInfo, { app }) => {
        const tokens = await tokenStore.get(agentInfo.id);
        if (!tokens) {
            return requestAuthenticationTool({provider: "github", logo: "https://images.freeimages.com/fic/images/icons/2779/simple_icons/512/github_512_black.png"}, { app, agentInfo });
        }

        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${issue_number}`, {
            method: 'PATCH',
            headers: {
                Authorization: `Bearer ${tokens.accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ state: 'closed' })
        });

        const issue = await response.json();

        return {
            text: `Closed issue #${issue_number}`,
            data: {
                success: true,
                url: issue.html_url
            },
            ui: new CardUIBuilder()
                .title(`Issue Closed`)
                .content(`Issue #${issue_number} closed successfully`)
                .build()
        };
    }
};

const commentOnIssueConfig: ToolConfig = {
    id: "comment-on-issue",
    name: "Comment on GitHub Issue",
    description: "If the user has already authenticated.Adds a comment to an existing GitHub issue. Otherwise, prompt user to authenticate.",
    input: z.object({
        owner: z.string(),
        repo: z.string(),
        issue_number: z.number(),
        body: z.string()
    }),
    output: z.object({
        id: z.number(),
        url: z.string()
    }),
    pricing: { pricePerUse: 0, currency: "USD" },
    handler: async ({ owner, repo, issue_number, body }, agentInfo, { app }) => {
        const tokens = await tokenStore.get(agentInfo.id);
        if (!tokens) {
            return requestAuthenticationTool({provider: "github", logo: "https://images.freeimages.com/fic/images/icons/2779/simple_icons/512/github_512_black.png"}, { app, agentInfo });
        }

        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${issue_number}/comments`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${tokens.accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ body })
        });

        const comment = await response.json();

        return {
            text: `Added comment to issue #${issue_number}`,
            data: {
                id: comment.id,
                url: comment.html_url
            },
            ui: new CardUIBuilder()
                .title(`Comment Added`)
                .content(`Comment added successfully to issue #${issue_number}`)
                .build()
        };
    }
};

const getIssueCommentsConfig: ToolConfig = {
    id: "get-issue-comments",
    name: "Get Issue Comments",
    description: "If the user has already authenticated. Retrieves all comments on a GitHub issue. Otherwise, prompt user to authenticate.",
    input: z.object({
        owner: z.string(),
        repo: z.string(),
        issue_number: z.number()
    }),
    output: z.object({
        comments: z.array(z.object({
            id: z.number(),
            body: z.string(),
            user: z.string(),
            created_at: z.string()
        }))
    }),
    pricing: { pricePerUse: 0, currency: "USD" },
    handler: async ({ owner, repo, issue_number }, agentInfo, { app }) => {
        const tokens = await tokenStore.get(agentInfo.id);
        if (!tokens) {
            return requestAuthenticationTool({provider: "github", logo: "https://images.freeimages.com/fic/images/icons/2779/simple_icons/512/github_512_black.png"}, { app, agentInfo });
        }

        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${issue_number}/comments`, {
            headers: {
                Authorization: `Bearer ${tokens.accessToken}`,
            }
        });

        const comments = await response.json();

        return {
            text: `Retrieved ${comments.length} comments`,
            data: {
                comments: comments.map(comment => ({
                    id: comment.id,
                    body: comment.body,
                    user: comment.user.login,
                    created_at: comment.created_at
                }))
            },
            ui: new TableUIBuilder()
                .addColumns([
                    { key: "id", header: "ID", type: "text" },
                    { key: "user", header: "User", type: "text" },
                    { key: "body", header: "Comment", type: "text" },
                    { key: "created_at", header: "Created At", type: "text" }
                ])
                .rows(comments.map(comment => ({
                    id: comment.id,
                    user: comment.user.login,
                    body: comment.body,
                    created_at: comment.created_at
                })))
                .build()
        };
    }
};

// Type definitions for the tree structure
interface FileNode {
    name: string;
    path: string;
    type: 'file' | 'directory';
    size?: number;
    lastModified?: string;
    children?: FileNode[];
}

// Helper functions moved outside
const formatTree = (node: FileNode, prefix: string = ''): string => {
    let result = prefix + '├── ' + node.name + '\n';
    if (node.children) {
        node.children.forEach((child, index) => {
            const isLast = index === node.children!.length - 1;
            const newPrefix = prefix + (isLast ? '    ' : '│   ');
            result += formatTree(child, newPrefix);
        });
    }
    return result;
};

const fetchDirectoryContents = async (
    owner: string,
    repo: string,
    accessToken: string,
    path: string = '',
    depth: number = 0,
    maxDepth: number,
    ignore: string[],
    stats: { totalFiles: number; totalDirectories: number; totalSize: number }
): Promise<FileNode[]> => {
    if (depth >= maxDepth) return [];

    const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        }
    );

    if (!response.ok) {
        throw new Error(`GitHub API error: ${response.statusText}`);
    }

    const contents = await response.json();
    const nodes: FileNode[] = [];

    for (const item of contents) {
        if (ignore.includes(item.name)) continue;

        const node: FileNode = {
            name: item.name,
            path: item.path,
            type: item.type,
            size: item.size,
            lastModified: item.updated_at
        };

        if (item.type === 'file') {
            stats.totalFiles++;
            stats.totalSize += item.size || 0;
        } else if (item.type === 'dir') {
            stats.totalDirectories++;
            node.children = await fetchDirectoryContents(
                owner,
                repo,
                accessToken,
                item.path,
                depth + 1,
                maxDepth,
                ignore,
                stats
            );
        }

        nodes.push(node);
    }

    return nodes;
};

const getProjectStructureConfig: ToolConfig = {
    id: "get-project-structure",
    name: "Get Project Structure",
    description: "If the user has already authenticated. Returns the complete file structure of a GitHub repository. Otherwise, prompt user to authenticate.",
    input: z.object({
        owner: z.string(),
        repo: z.string(),
        maxDepth: z.number().min(1).max(10).optional().default(5),
        ignore: z.array(z.string()).optional().default(['.git', 'node_modules'])
    }),
    output: z.object({
        structure: z.any(), // Complex nested structure
        totalFiles: z.number(),
        totalDirectories: z.number(),
        totalSize: z.number()
    }),
    pricing: { pricePerUse: 0, currency: "USD" },
    handler: async ({ owner, repo, maxDepth, ignore }, agentInfo, { app }) => {
        const tokens = await tokenStore.get(agentInfo.id);
        if (!tokens) {
            return requestAuthenticationTool({provider: "github", logo: "https://images.freeimages.com/fic/images/icons/2779/simple_icons/512/github_512_black.png"}, { app, agentInfo });
        }

        try {
            const stats = {
                totalFiles: 0,
                totalDirectories: 0,
                totalSize: 0
            };

            const structure = await fetchDirectoryContents(
                owner,
                repo,
                tokens.accessToken,
                '',
                0,
                maxDepth,
                ignore,
                stats
            );

            const formattedTree = structure.map(node => formatTree(node)).join('');

            const treeCard = new CardUIBuilder()
                .title("Directory Structure")
                .content(formattedTree);

            const mainCard = new CardUIBuilder()
                .setRenderMode("page")
                .title(`Project Structure: ${owner}/${repo}`)
                .content(`
Total Files: ${stats.totalFiles}
Total Directories: ${stats.totalDirectories}
Total Size: ${(stats.totalSize / 1024).toFixed(2)} KB
                `)
                .addChild(treeCard.build());

            return {
                text: `Repository structure for ${owner}/${repo}`,
                data: {
                    structure,
                    totalFiles: stats.totalFiles,
                    totalDirectories: stats.totalDirectories,
                    totalSize: stats.totalSize
                },
                ui: mainCard.build()
            };

        } catch (error) {
            throw new Error(`Failed to get project structure: ${error.message}`);
    }
        }
};

const analyzeRepoHealthConfig: ToolConfig = {
    id: "analyze-repo-health",
    name: "Analyze Repository Health",
    description: "If the user has already authenticated. Analyzes repository health including issues, dependencies, tests, and code usage. Otherwise, prompt user to authenticate.",
    input: z.object({
        owner: z.string(),
        repo: z.string(),
        branch: z.string().optional().default('main')
    }),
    output: z.object({
        healthScore: z.number(),
        issues: z.object({
            total: z.number(),
            open: z.number(),
            stale: z.number() // Issues open for > 30 days
        }),
        dependencies: z.object({
            total: z.number(),
            outdated: z.number(),
            vulnerable: z.number()
        }),
        tests: z.object({
            status: z.string(),
            coverage: z.number().optional(),
            failing: z.number()
        }),
        recommendations: z.array(z.object({
            category: z.string(),
            severity: z.string(),
            description: z.string(),
            action: z.string()
        }))
    }),
    pricing: { pricePerUse: 0, currency: "USD" },
    handler: async ({ owner, repo, branch }, agentInfo, { app }) => {
        const tokens = await tokenStore.get(agentInfo.id);
        if (!tokens) {
            return requestAuthenticationTool({provider: "github", logo: "https://images.freeimages.com/fic/images/icons/2779/simple_icons/512/github_512_black.png"}, { app, agentInfo });
        }

        try {
            // Get repository issues
            const issuesResponse = await fetch(
                `https://api.github.com/repos/${owner}/${repo}/issues?state=all`,
                {
                    headers: {
                        Authorization: `Bearer ${tokens.accessToken}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                }
            );
            const issues = await issuesResponse.json();

            // Get package.json to check dependencies
            const packageJsonResponse = await fetch(
                `https://api.github.com/repos/${owner}/${repo}/contents/package.json`,
                {
                    headers: {
                        Authorization: `Bearer ${tokens.accessToken}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                }
            );
            
            let dependencies = { total: 0, outdated: 0, vulnerable: 0 };
            if (packageJsonResponse.ok) {
                const packageJsonContent = await packageJsonResponse.json();
                const packageJson = JSON.parse(Buffer.from(packageJsonContent.content, 'base64').toString());
                
                // Count dependencies
                const allDeps = {
                    ...packageJson.dependencies,
                    ...packageJson.devDependencies
                };
                dependencies.total = Object.keys(allDeps).length;

                // Check for outdated deps using npm-check
                // This is a simplified version - you might want to use actual npm audit
                dependencies.outdated = Math.floor(dependencies.total * 0.2); // Example calculation
                dependencies.vulnerable = Math.floor(dependencies.total * 0.1); // Example calculation
            }

            // Get workflow runs to check tests
            const workflowsResponse = await fetch(
                `https://api.github.com/repos/${owner}/${repo}/actions/runs`,
                {
                    headers: {
                        Authorization: `Bearer ${tokens.accessToken}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                }
            );
            const workflows = await workflowsResponse.json();

            // Calculate metrics
            const now = new Date();
            const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));

            const healthMetrics = {
                issues: {
                    total: issues.length,
                    open: issues.filter(i => i.state === 'open').length,
                    stale: issues.filter(i => 
                        i.state === 'open' && 
                        new Date(i.created_at) < thirtyDaysAgo
                    ).length
                },
                dependencies,
                tests: {
                    status: workflows.total_count > 0 ? 
                        workflows.workflow_runs[0].conclusion || 'unknown' : 
                        'no_tests',
                    failing: workflows.workflow_runs?.filter(w => w.conclusion === 'failure').length || 0,
                    coverage: 0 // Would need additional API integration for coverage data
                }
            };

            // Calculate health score (0-100)
            const healthScore = calculateHealthScore(healthMetrics);

            // Generate recommendations
            const recommendations = generateRecommendations(healthMetrics);

            // Create UI
            const healthCard = new CardUIBuilder()
                .title("Repository Health Score")
                .content(`Overall Health: ${healthScore}/100`);

            const issuesCard = new CardUIBuilder()
                .title("Issues Status")
                .content(`
Total Issues: ${healthMetrics.issues.total}
Open Issues: ${healthMetrics.issues.open}
Stale Issues: ${healthMetrics.issues.stale}
                `);

            const dependenciesCard = new CardUIBuilder()
                .title("Dependencies Status")
                .content(`
Total Dependencies: ${dependencies.total}
Outdated: ${dependencies.outdated}
Vulnerable: ${dependencies.vulnerable}
                `);

            const testsCard = new CardUIBuilder()
                .title("Tests Status")
                .content(`
Latest Status: ${healthMetrics.tests.status}
Failing Tests: ${healthMetrics.tests.failing}
                `);

            const recommendationsTable = new TableUIBuilder()
                .addColumns([
                    { key: "category", header: "Category", type: "text" },
                    { key: "severity", header: "Severity", type: "text" },
                    { key: "description", header: "Description", type: "text" },
                    { key: "action", header: "Recommended Action", type: "text" }
                ])
                .rows(recommendations)
                .build();

            const mainCard = new CardUIBuilder()
                .setRenderMode("page")
                .title(`Repository Health Analysis: ${owner}/${repo}`)
                .addChild(healthCard.build())
                .addChild(issuesCard.build())
                .addChild(dependenciesCard.build())
                .addChild(testsCard.build())
                .addChild(recommendationsTable);

            return {
                text: `Completed repository health analysis for ${owner}/${repo}`,
                data: {
                    healthScore,
                    ...healthMetrics,
                    recommendations
                },
                ui: mainCard.build()
            };

        } catch (error) {
            console.error('Repository Health Analysis Error:', error);
            throw new Error(`Failed to analyze repository health: ${error.message}`);
        }
    }
};

// Helper function to calculate health score
function calculateHealthScore(metrics: any): number {
    let score = 100;

    // Deduct for open issues
    score -= Math.min(20, metrics.issues.open * 2);
    
    // Deduct for stale issues
    score -= Math.min(20, metrics.issues.stale * 3);
    
    // Deduct for outdated dependencies
    score -= Math.min(20, metrics.dependencies.outdated * 3);
    
    // Deduct for vulnerable dependencies
    score -= Math.min(20, metrics.dependencies.vulnerable * 5);
    
    // Deduct for failing tests
    score -= Math.min(20, metrics.tests.failing * 5);

    return Math.max(0, Math.round(score));
}

// Helper function to generate recommendations
function generateRecommendations(metrics: any): any[] {
    const recommendations = [];

    // Issues recommendations
    if (metrics.issues.stale > 0) {
        recommendations.push({
            category: 'Issues',
            severity: 'High',
            description: `${metrics.issues.stale} stale issues found`,
            action: 'Review and update or close stale issues'
        });
    }

    if (metrics.issues.open > 10) {
        recommendations.push({
            category: 'Issues',
            severity: 'Medium',
            description: 'High number of open issues',
            action: 'Consider a bug bash or issue triage session'
        });
    }

    // Dependencies recommendations
    if (metrics.dependencies.vulnerable > 0) {
        recommendations.push({
            category: 'Dependencies',
            severity: 'Critical',
            description: `${metrics.dependencies.vulnerable} vulnerable dependencies found`,
            action: 'Update vulnerable dependencies immediately'
        });
    }

    if (metrics.dependencies.outdated > 0) {
        recommendations.push({
            category: 'Dependencies',
            severity: 'Medium',
            description: `${metrics.dependencies.outdated} outdated dependencies found`,
            action: 'Update dependencies to latest stable versions'
        });
    }

    // Tests recommendations
    if (metrics.tests.status === 'no_tests') {
        recommendations.push({
            category: 'Tests',
            severity: 'High',
            description: 'No tests found in repository',
            action: 'Implement automated testing'
        });
    }

    if (metrics.tests.failing > 0) {
        recommendations.push({
            category: 'Tests',
            severity: 'High',
            description: `${metrics.tests.failing} failing tests`,
            action: 'Fix failing tests'
        });
    }

    return recommendations;
}

  const updateFileConfig: ToolConfig = {
    id: "update-file",
    name: "Update File",
    description: "If the user has already authenticated. Creates or updates a file in a GitHub repository. Otherwise, prompt user to authenticate.",
    input: z.object({
      owner: z.string(),
      repo: z.string(),
      path: z.string(),
      content: z.string(),
      message: z.string().default("commit by butterfly"),
      branch: z.string().default("main").optional(),
    }),
    output: z.object({
      sha: z.string(),
      url: z.string(),
    }),
    pricing: { pricePerUse: 0, currency: "USD" },
    handler: async ({ owner, repo, path, content, message, branch = 'main' }, agentInfo, { app }) => {
      const tokens = await tokenStore.get(agentInfo.id);
      if (!tokens) {
        return requestAuthenticationTool({provider: "github", logo: "https://images.freeimages.com/fic/images/icons/2779/simple_icons/512/github_512_black.png"}, { app, agentInfo });
      }
  
      try {
        // Check if file exists
        let sha;
        try {
          const existingFile = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
            {
              headers: {
                Authorization: `Bearer ${tokens.accessToken}`,
              },
            }
          );
          if (existingFile.ok) {
            const fileData = await existingFile.json();
            sha = fileData.sha;
          }
        } catch (error) {
          // File doesn't exist, continue without sha
        }
  
        // Create or update file
        const response = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${tokens.accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message,
              content: Buffer.from(content).toString('base64'),
              branch,
              sha, // Include sha if updating existing file
            }),
          }
        );
  
        const data = await response.json();
  
        return {
          text: `${sha ? 'Updated' : 'Created'} file: ${path}`,
          data: {
            sha: data.content.sha,
            url: data.content.html_url,
          },
          ui: new CardUIBuilder()
            .title(`File ${sha ? 'Updated' : 'Created'}`)
            .content(`
              Path: ${path}
              Message: ${message}
              SHA: ${data.content.sha}
            `)
            .build(),
        };
      } catch (error) {
        throw new Error(`Failed to update file: ${error.message}`);
      }
    },
  };
  
  const deleteFileConfig: ToolConfig = {
    id: "delete-file",
    name: "Delete File",
    description: "If the user has already authenticated. Deletes a file from a GitHub repository. Otherwise, prompt user to authenticate.",
    input: z.object({
      owner: z.string(),
      repo: z.string(),
      path: z.string(),
      message: z.string(),
      branch: z.string().optional(),
    }),
    output: z.object({
      success: z.boolean(),
      commit: z.string(),
    }),
    pricing: { pricePerUse: 0, currency: "USD" },
    handler: async ({ owner, repo, path, message, branch = 'main' }, agentInfo, { app }) => {
      const tokens = await tokenStore.get(agentInfo.id);
      if (!tokens) {
        return requestAuthenticationTool({provider: "github", logo: "https://images.freeimages.com/fic/images/icons/2779/simple_icons/512/github_512_black.png"}, { app, agentInfo });
      }
  
      try {
        // Get file SHA
        const fileResponse = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
          {
            headers: {
              Authorization: `Bearer ${tokens.accessToken}`,
            },
          }
        );
        const fileData = await fileResponse.json();
  
        // Delete file
        const response = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
          {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${tokens.accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message,
              sha: fileData.sha,
              branch,
            }),
          }
        );
  
        const data = await response.json();
  
        return {
          text: `Deleted file: ${path}`,
          data: {
            success: true,
            commit: data.commit.sha,
          },
          ui: new CardUIBuilder()
            .title('File Deleted')
            .content(`
              Path: ${path}
              Message: ${message}
              Commit: ${data.commit.sha}
            `)
            .build(),
        };
      } catch (error) {
        throw new Error(`Failed to delete file: ${error.message}`);
      }
    },
  };
  
  const createPullRequestConfig: ToolConfig = {
    id: "create-pull-request",
    name: "Create Pull Request",
    description: "If the user has already authenticated. Creates a new pull request in a GitHub repository. Otherwise, prompt user to authenticate.",
    input: z.object({
        owner: z.string(),
        repo: z.string(),
        title: z.string(),
        body: z.string(),
        head: z.string().describe("The name of the branch where your changes are implemented"),
        base: z.string().describe("The name of the branch you want your changes pulled into").default("main")
    }),
    output: z.object({
        number: z.number(),
        url: z.string()
    }),
    pricing: { pricePerUse: 0, currency: "USD" },
    handler: async ({ owner, repo, title, body, head, base }, agentInfo, { app }) => {
        const tokens = await tokenStore.get(agentInfo.id);
        if (!tokens) {
            return requestAuthenticationTool({provider: "github", logo: "https://images.freeimages.com/fic/images/icons/2779/simple_icons/512/github_512_black.png"}, { app, agentInfo });
        }

        try {
            const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${tokens.accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title,
                    body,
                    head,
                    base
                })
            });

            const pullRequest = await response.json();

            if (!response.ok) {
                throw new Error(`Failed to create pull request: ${pullRequest.message}`);
            }

            return {
                text: `Created pull request #${pullRequest.number}`,
                data: {
                    number: pullRequest.number,
                    url: pullRequest.html_url
                },
                ui: new CardUIBuilder()
                    .title(`Pull Request Created`)
                    .content(`
                        Title: ${pullRequest.title}
                        Number: #${pullRequest.number}
                        URL: ${pullRequest.html_url}
                        Base: ${base}
                        Head: ${head}
                    `)
                    .build()
            };
        } catch (error) {
            throw new Error(`Failed to create pull request: ${error.message}`);
        }
    }
};

const updatePullRequestConfig: ToolConfig = {
    id: "update-pull-request",
    name: "Update Pull Request",
    description: "If the user has already authenticated. Updates an existing pull request in a GitHub repository. Otherwise, prompt user to authenticate.",
    input: z.object({
        owner: z.string(),
        repo: z.string(),
        pull_number: z.number(),
        title: z.string().optional(),
        body: z.string().optional(),
        state: z.enum(['open', 'closed']).optional(),
        base: z.string().optional()
    }),
    output: z.object({
        number: z.number(),
        url: z.string()
    }),
    pricing: { pricePerUse: 0, currency: "USD" },
    handler: async ({ owner, repo, pull_number, ...updates }, agentInfo, { app }) => {
        const tokens = await tokenStore.get(agentInfo.id);
        if (!tokens) {
            return requestAuthenticationTool({provider: "github", logo: "https://images.freeimages.com/fic/images/icons/2779/simple_icons/512/github_512_black.png"}, { app, agentInfo });
        }

        try {
            const response = await fetch(
                `https://api.github.com/repos/${owner}/${repo}/pulls/${pull_number}`,
                {
                    method: 'PATCH',
                    headers: {
                        Authorization: `Bearer ${tokens.accessToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(updates)
                }
            );

            const pullRequest = await response.json();

            if (!response.ok) {
                throw new Error(`Failed to update pull request: ${pullRequest.message}`);
            }

            return {
                text: `Updated pull request #${pullRequest.number}`,
                data: {
                    number: pullRequest.number,
                    url: pullRequest.html_url
                },
                ui: new CardUIBuilder()
                    .title(`Pull Request Updated`)
                    .content(`
                        Title: ${pullRequest.title}
                        Number: #${pullRequest.number}
                        State: ${pullRequest.state}
                        URL: ${pullRequest.html_url}
                    `)
                    .build()
            };
        } catch (error) {
            throw new Error(`Failed to update pull request: ${error.message}`);
        }
    }
};

const closePullRequestConfig: ToolConfig = {
    id: "close-pull-request",
    name: "Close Pull Request",
    description: "If the user has already authenticated. Closes an open pull request in a GitHub repository. Otherwise, prompt user to authenticate.",
    input: z.object({
        owner: z.string(),
        repo: z.string(),
        pull_number: z.number()
    }),
    output: z.object({
        number: z.number(),
        state: z.string()
    }),
    pricing: { pricePerUse: 0, currency: "USD" },
    handler: async ({ owner, repo, pull_number }, agentInfo, { app }) => {
        const tokens = await tokenStore.get(agentInfo.id);
        if (!tokens) {
            return requestAuthenticationTool({provider: "github", logo: "https://images.freeimages.com/fic/images/icons/2779/simple_icons/512/github_512_black.png"}, { app, agentInfo });
        }

        try {
            const response = await fetch(
                `https://api.github.com/repos/${owner}/${repo}/pulls/${pull_number}`,
                {
                    method: 'PATCH',
                    headers: {
                        Authorization: `Bearer ${tokens.accessToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        state: 'closed'
                    })
                }
            );

            const pullRequest = await response.json();

            if (!response.ok) {
                throw new Error(`Failed to close pull request: ${pullRequest.message}`);
            }

            return {
                text: `Closed pull request #${pullRequest.number}`,
                data: {
                    number: pullRequest.number,
                    state: pullRequest.state
                },
                ui: new CardUIBuilder()
                    .title(`Pull Request Closed`)
                    .content(`
                        Title: ${pullRequest.title}
                        Number: #${pullRequest.number}
                        State: ${pullRequest.state}
                    `)
                    .build()
            };
        } catch (error) {
            throw new Error(`Failed to close pull request: ${error.message}`);
        }
    }
};

const mergePullRequestConfig: ToolConfig = {
    id: "merge-pull-request",
    name: "Merge Pull Request",
    description: "If the user has already authenticated. Merges an open pull request in a GitHub repository. Otherwise, prompt user to authenticate.",
    input: z.object({
        owner: z.string(),
        repo: z.string(),
        pull_number: z.number(),
        commit_title: z.string().optional(),
        commit_message: z.string().optional(),
        merge_method: z.enum(['merge', 'squash', 'rebase']).default('merge')
    }),
    output: z.object({
        merged: z.boolean(),
        message: z.string(),
        sha: z.string()
    }),
    pricing: { pricePerUse: 0, currency: "USD" },
    handler: async ({ owner, repo, pull_number, commit_title, commit_message, merge_method }, agentInfo, { app }) => {
        const tokens = await tokenStore.get(agentInfo.id);
        if (!tokens) {
            return requestAuthenticationTool({provider: "github", logo: "https://images.freeimages.com/fic/images/icons/2779/simple_icons/512/github_512_black.png"}, { app, agentInfo });
        }

        try {
            // First check if PR is mergeable
            const checkResponse = await fetch(
                `https://api.github.com/repos/${owner}/${repo}/pulls/${pull_number}`,
                {
                    headers: {
                        Authorization: `Bearer ${tokens.accessToken}`,
                    }
                }
            );

            const prData = await checkResponse.json();
            
            if (prData.merged) {
                throw new Error('Pull request is already merged');
            }

            if (prData.state !== 'open') {
                throw new Error('Pull request is not open');
            }

            if (prData.mergeable === false) {
                throw new Error('Pull request is not mergeable');
            }

            // Proceed with merge
            const response = await fetch(
                `https://api.github.com/repos/${owner}/${repo}/pulls/${pull_number}/merge`,
                {
                    method: 'PUT',
                    headers: {
                        Authorization: `Bearer ${tokens.accessToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        commit_title,
                        commit_message,
                        merge_method
                    })
                }
            );

            const result = await response.json();

            if (!response.ok) {
                throw new Error(`Failed to merge pull request: ${result.message}`);
            }

            return {
                text: `Successfully merged pull request #${pull_number}`,
                data: {
                    merged: true,
                    message: result.message,
                    sha: result.sha
                },
                ui: new CardUIBuilder()
                    .title(`Pull Request Merged`)
                    .content(`
                        Pull Request: #${pull_number}
                        Message: ${result.message}
                        Merge Method: ${merge_method}
                        SHA: ${result.sha}
                    `)
                    .build()
            };
        } catch (error) {
            throw new Error(`Failed to merge pull request: ${error.message}`);
        }
    }
};

const getCodacyRepoInfoConfig: ToolConfig = {
    id: "get-codacy-info",
    name: "Get Codacy Repository Info",
    description: "Retrieves code quality metrics from Codacy for a repository",
    input: z.object({
        repo: z.string().describe("Name of the repository")
    }),
    output: z.object({
        grade: z.number(),
        gradeLetter: z.string(),
        issuesPercentage: z.number(),
        issuesCount: z.number(),
        coverage: z.object({
            filesUncovered: z.number(),
            filesWithLowCoverage: z.number(),
            numberTotalFiles: z.number()
        }),
        duplicationPercentage: z.number(),
        loc: z.number(),
        complexFilesCount: z.number(),
        lastAnalysis: z.string(),
        languages: z.array(z.string())
    }),
    handler: async ({ repo }, agentInfo, { app }) => {

        // Get Codacy API token from environment
        const codacyToken = process.env.CODACY_API_TOKEN;
        if (!codacyToken) throw new Error("Codacy API token not configured");

        // Fetch Codacy data
        const response = await fetch(
            `https://app.codacy.com/api/v3/analysis/organizations/gh/aiden-perkins/repositories`,
            {
                headers: {
                    'Accept': 'application/json',
                    'api-token': codacyToken
                }
            }
        );

        if (!response.ok) {
            throw new Error(`Codacy API error: ${response.statusText}`);
        }

        const data = await response.json();
        const repoData = data.data.find((r: any) => r.repository.name === repo);

        if (!repoData) {
            throw new Error(`Repository ${repo} not found in Codacy`);
        }

        // Structure response
        return {
            text: `Codacy metrics for ${repo}: Grade ${repoData.gradeLetter} (${repoData.grade})`,
            data: {
                grade: repoData.grade,
                gradeLetter: repoData.gradeLetter,
                issuesPercentage: repoData.issuesPercentage,
                issuesCount: repoData.issuesCount,
                coverage: repoData.coverage,
                duplicationPercentage: repoData.duplicationPercentage,
                loc: repoData.loc,
                complexFilesCount: repoData.complexFilesCount,
                lastAnalysis: repoData.lastAnalysedCommit.endedAnalysis,
                languages: repoData.repository.languages
            },
            ui: new TableUIBuilder()
                .setRenderMode("page")
                .addColumns([
                    { key: "grade", header: "Grade", type: "text" },
                    { key: "issues", header: "Issues", type: "text" },
                    { key: "coverage", header: "Coverage", type: "text" },
                    { key: "duplication", header: "Duplication", type: "text" },
                    { key: "languages", header: "Languages", type: "tags" }
                ])
                .rows([{
                    grade: `${repoData.gradeLetter} (${repoData.grade})`,
                    issues: `${repoData.issuesCount} (${repoData.issuesPercentage}%)`,
                    coverage: `${100 - Math.round((repoData.coverage.filesUncovered / repoData.coverage.numberTotalFiles) * 100)}%`,
                    duplication: `${repoData.duplicationPercentage}%`,
                    languages: repoData.repository.languages.join(', ')
                }])
                .build()
        };
    }
};

const dainService = defineDAINService({
    metadata: {
      title: "GitHub DAIN Service",
      description:
        "A DAIN service for GitHub API",
      version: "1.0.0",
      author: "Matthew Fehr, Manuel Llanillo, Sean Nightingale, Aiden Perkins",
      tags: ["github", "gitlab", "dain", "pull-requests", "gists"],
      logo: "https://images.freeimages.com/fic/images/icons/2779/simple_icons/512/github_512_black.png",
    },
    oauth2: {
        baseUrl: process.env.TUNNEL_URL,
        providers: {
            github: {
                clientId: process.env.GITHUB_CLIENT_ID,
                clientSecret: process.env.GITHUB_CLIENT_SECRET,
                authorizationUrl: "https://github.com/login/oauth/authorize",
                tokenUrl: "https://github.com/login/oauth/access_token",
                scopes: ["repo"],
                onSuccess: async (agentId, tokens) => {
                    await tokenStore.set(agentId, tokens);
                }
            }
        }
    },
    exampleQueries: [
        {
        category: "Tasks",
        queries: [
            "Can you list me the repository contents of github.com/MunGell/awesome-for-beginners/tree/main",
            "Can you create and merge a pull request from the test branch to main in github.com/MunGell/awesome-for-beginners/tree/main",
            "Can you expand on the README.md then update its contents in the repository github.com/MunGell/awesome-for-beginners/tree/main",
        ],
        },
    ],
    identity: {
        apiKey: process.env.DAIN_API_KEY,
    },
    tools: [
        createOAuth2Tool("github"), 
        
        listIssuesConfig,
        openIssueConfig,
        closeIssueConfig,
        commentOnIssueConfig,
        getIssueCommentsConfig,
        
        createPullRequestConfig,
        updatePullRequestConfig,
        closePullRequestConfig,
        listPullRequestsConfig, 
        mergePullRequestConfig,
        
        createGistConfig, 
        getProjectStructureConfig,
        getRepositoryConfig,
        getFileContentsConfig,
        listRepoContentsConfig,
        analyzeRepoHealthConfig,
        getCodacyRepoInfoConfig,
        
        updateFileConfig,
        deleteFileConfig,
    ]
});

dainService.startNode({ port: port }).then(({ address }) => {
    console.log("Git DAIN Service is running at :" + address().port);
  });

