import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Layout,
  Button,
  Input,
  Tabs,
  Row,
  Col,
  Card,
  List,
  Empty,
  Space,
  Dropdown,
  message,
  Modal,
  Form,
  Select,
  Spin,
  Tooltip,
  Badge,
  Menu,
  Divider,
  Collapse,
  Radio,
} from 'antd';
import { Editor } from '@monaco-editor/react';
import {
  SendOutlined,
  SaveOutlined,
  PlusOutlined,
  DeleteOutlined,
  CopyOutlined,
  DownloadOutlined,
  UploadOutlined,
  SettingOutlined,
  SearchOutlined,
  ClearOutlined,
  FolderOutlined,
  FileOutlined,
  ClockCircleOutlined,
  EditOutlined,
  CaretDownOutlined,
  CaretRightOutlined,
} from '@ant-design/icons';
import {
  indexedDBService,
  httpEngine,
  variableSystem,
  scriptEngine,
  importExportService,
  importParserService,
} from './services';
import {
  Collection,
  HttpRequest,
  HttpMethod,
  BodyType,
  RawBodyFormat,
  AuthType,
  HistoryEntry,
  HttpResponse,
  AppSettings,
  KeyValuePair,
} from './types';

const { Header, Sider, Content } = Layout;
const { TabPane } = Tabs;
const { TextArea } = Input;

interface OpenTab {
  requestId: string;
  request: HttpRequest;
  isPersistent: boolean; // true for double-click, false for single-click
  isTemporary?: boolean; // marks if it's the temporary tab (single-click)
}

  interface AppState {
  collections: Collection[];
  history: HistoryEntry[];
  settings: AppSettings | null;
  currentRequest: HttpRequest | null;
  currentCollectionId: string | null;
  response: HttpResponse | null | undefined;
  loading: boolean;
  sending: boolean;
  requestAbortController: AbortController | null;
  showCollectionModal: boolean;
  newCollectionName: string;
  showImportModal: boolean;
  showSettingsModal: boolean;
  showRequestNameModal: boolean;
  requestName: string;
  saveToCollectionId: string | null;
  expandedCollections: Set<string>;
  collectionRequests: Map<string, HttpRequest[]>;
  editingCollectionId: string | null;
  editingCollectionName: string;
  openTabs: OpenTab[];
  activeTabId: string | null;
  showEditRequestModal?: boolean;
  editRequestModalId?: string | null;
  editRequestModalName?: string;
  editRequestModalCollectionId?: string | null;
  editRequestModalSourceCollectionId?: string | null;
}

const ApiDebugTool: React.FC = () => {
  const [appState, setAppState] = useState<AppState>({
    collections: [],
    history: [],
    settings: null,
    currentRequest: null,
    currentCollectionId: null,
    response: null,
    loading: true,
    sending: false,
    requestAbortController: null,
    showCollectionModal: false,
    newCollectionName: '',
    showImportModal: false,
    showSettingsModal: false,
    showRequestNameModal: false,
    requestName: '',
    saveToCollectionId: null,
    expandedCollections: new Set<string>(),
    collectionRequests: new Map<string, HttpRequest[]>(),
    editingCollectionId: null,
    editingCollectionName: '',
    openTabs: [],
    activeTabId: null,
    showEditRequestModal: false,
    editRequestModalId: null,
    editRequestModalName: '',
    editRequestModalCollectionId: null,
    editRequestModalSourceCollectionId: null,
  });

  const [searchText, setSearchText] = useState('');
  const [activeTab, setActiveTab] = useState('params');
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lastClickTime, setLastClickTime] = useState<{ [key: string]: number }>({});
  const [tabClickTimer, setTabClickTimer] = useState<{ [key: string]: NodeJS.Timeout }>({});
  
  // Monaco Editor refs
  const bodyEditorRef = useRef<any>(null);
  const responseEditorRef = useRef<any>(null);
  const preScriptEditorRef = useRef<any>(null);
  const postScriptEditorRef = useRef<any>(null);

  // Helper: Generate cURL command from request
  const generateCurlCommand = (request: HttpRequest): string => {
    let curl = 'curl -X ' + request.method;

    // Add URL with query parameters
    let url = request.url;
    const enabledParams = request.params.filter(p => p.enabled);
    if (enabledParams.length > 0) {
      const queryString = enabledParams
        .map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
        .join('&');
      url += (url.includes('?') ? '&' : '?') + queryString;
    }
    curl += ` "${url}"`;

    // Add headers
    const enabledHeaders = request.headers.filter(h => h.enabled);
    for (const header of enabledHeaders) {
      curl += ` -H "${header.key}: ${header.value}"`;
    }

    // Add body if present
    if (request.body.type === BodyType.RAW && request.body.raw?.content) {
      curl += ` -d '${request.body.raw.content.replace(/'/g, "'\"'\"'")}'`;
    } else if (request.body.type === BodyType.FORM_DATA && request.body.formData) {
      const enabledFormData = request.body.formData.filter(f => f.enabled);
      for (const formItem of enabledFormData) {
        curl += ` -F "${formItem.key}=${formItem.value}"`;
      }
    } else if (request.body.type === BodyType.X_FORM_URLENCODED && request.body.urlencoded) {
      const enabledUrlencoded = request.body.urlencoded.filter(u => u.enabled);
      const data = enabledUrlencoded
        .map(u => `${encodeURIComponent(u.key)}=${encodeURIComponent(u.value)}`)
        .join('&');
      if (data) {
        curl += ` -d "${data}"`;
      }
    }

    // Add auth if needed
    if (request.auth.type === AuthType.BEARER && request.auth.bearer?.token) {
      curl += ` -H "Authorization: Bearer ${request.auth.bearer.token}"`;
    } else if (request.auth.type === AuthType.BASIC && request.auth.basic?.username) {
      const credentials = btoa(`${request.auth.basic.username}:${request.auth.basic.password || ''}`);
      curl += ` -H "Authorization: Basic ${credentials}"`;
    } else if (request.auth.type === AuthType.API_KEY && request.auth.apiKey?.key) {
      if (request.auth.apiKey.in === 'header') {
        curl += ` -H "${request.auth.apiKey.key}: ${request.auth.apiKey.value}"`;
      } else if (request.auth.apiKey.in === 'query') {
        curl += `&${encodeURIComponent(request.auth.apiKey.key)}=${encodeURIComponent(request.auth.apiKey.value)}`;
      }
    }

    return curl;
  };

  // Helper: Format response body based on content type
  const formatResponseBody = (body: string, contentType: string = ''): string => {
    try {
      // Check Content-Type header
      const isJson = contentType.includes('application/json') || (contentType === '' && body.trim().startsWith('{') || body.trim().startsWith('['));
      const isHtml = contentType.includes('text/html') || (contentType === '' && body.trim().startsWith('<'));
      const isXml = contentType.includes('xml') || (contentType === '' && body.trim().includes('<?xml'));

      if (isJson) {
        const parsed = JSON.parse(body);
        return JSON.stringify(parsed, null, 2);
      } else if (isHtml) {
        // Simple HTML formatting: add line breaks and indentation
        let formatted = body
          .replace(/></g, '>\n<')
          .replace(/^\s*</, '<');
        // Add indentation
        let indent = 0;
        formatted = formatted.split('\n').map((line) => {
          const trimmed = line.trim();
          if (trimmed.startsWith('</')) indent = Math.max(0, indent - 1);
          const indented = '  '.repeat(indent) + trimmed;
          if (trimmed.startsWith('<') && !trimmed.startsWith('</') && !trimmed.endsWith('/>') && !trimmed.startsWith('<!')) {
            indent++;
          }
          return indented;
        }).join('\n');
        return formatted;
      } else if (isXml) {
        // XML formatting
        let formatted = body
          .replace(/></g, '>\n<')
          .replace(/^\s*</, '<');
        // Add indentation
        let indent = 0;
        formatted = formatted.split('\n').map((line) => {
          const trimmed = line.trim();
          if (trimmed.startsWith('</')) indent = Math.max(0, indent - 1);
          const indented = '  '.repeat(indent) + trimmed;
          if (trimmed.startsWith('<') && !trimmed.startsWith('</') && !trimmed.endsWith('/>')) {
            indent++;
          }
          return indented;
        }).join('\n');
        return formatted;
      }
      return body;
    } catch (error) {
      return body;
    }
  };

  // Helper: Detect response language from content-type and body
  const detectResponseLanguage = (body: string, contentType: string = ''): string => {
    if (!body.trim()) return 'plaintext';
    
    if (contentType.includes('application/json')) return 'json';
    if (contentType.includes('text/html')) return 'html';
    if (contentType.includes('xml')) return 'xml';
    
    const trimmed = body.trim();
    
    // Try to detect JSON
    if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && trimmed.match(/[{}/\[\]]/)) {
      try {
        JSON.parse(trimmed);
        return 'json';
      } catch {}
    }
    
    // Try to detect HTML
    if (trimmed.match(/<\s*!DOCTYPE|<\s*html|<\s*head|<\s*body/i)) {
      return 'html';
    }
    
    // Try to detect XML
    if (trimmed.startsWith('<?xml') || (trimmed.startsWith('<') && trimmed.includes('</'))) {
      return 'xml';
    }
    
    // Try to detect HTML tags
    if (trimmed.match(/<\s*[a-zA-Z]/)) {
      return 'html';
    }
    
    return 'plaintext';
  };

  // Helper: Detect language from content
  const detectLanguage = (content: string): string => {
    if (!content.trim()) return 'json';
    
    const trimmed = content.trim();
    
    // Try to detect JSON
    if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && trimmed.match(/[{}\[\]]/)) {
      try {
        JSON.parse(trimmed);
        return 'json';
      } catch {}
    }
    
    // Try to detect XML
    if (trimmed.startsWith('<') && trimmed.includes('</')) {
      return 'xml';
    }
    
    // Try to detect HTML
    if (trimmed.match(/<\s*!?\s*[a-zA-Z]/)) {
      return 'html';
    }
    
    // Default to JSON
    return 'json';
  };

  // Initialize app
  useEffect(() => {
    initializeApp();
  }, []);

  // Load requests for all collections
  useEffect(() => {
    const loadCollectionRequests = async () => {
      const newMap = new Map<string, HttpRequest[]>();
      for (const collection of appState.collections) {
        try {
          const requests = await indexedDBService.getRequestsByCollection(collection.id);
          newMap.set(collection.id, requests);
        } catch (error) {
          console.error(`Failed to load requests for collection ${collection.id}:`, error);
        }
      }
      setAppState(prev => ({
        ...prev,
        collectionRequests: newMap,
      }));
    };
    if (appState.collections.length > 0) {
      loadCollectionRequests();
    }
  }, [appState.collections]);

  const initializeApp = async () => {
    try {
      await indexedDBService.init();
      const settings = await indexedDBService.getSettings();
      let collections = await indexedDBService.getAllCollections();
      const history = await indexedDBService.getHistory(50);

      const defaultSettings: AppSettings = {
        id: 'app_settings',
        variables: [],
        defaultHeaders: [
          {
            id: 'header_default_1',
            key: 'User-Agent',
            value: 'ORAEN API Debug Tool/1.0',
            enabled: true,
          },
        ],
        defaultTimeout: 30000,
        maxHistorySize: 1000,
        historyExpireDays: 30,
        updatedAt: Date.now(),
      };

      // Create default collection if no collections exist
      if (collections.length === 0) {
        const defaultCollection: Collection = {
          id: `col_${Date.now()}`,
          name: '默认文件夹',
          items: [],
          variables: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        await indexedDBService.createCollection(defaultCollection);
        collections = [defaultCollection];
      }

      setAppState(prev => ({
        ...prev,
        collections,
        history,
        settings: settings || defaultSettings,
        loading: false,
      }));

      // Auto-clean expired history
      if (settings) {
        await indexedDBService.clearOldHistory(
          settings.historyExpireDays,
          settings.maxHistorySize
        );
      }
    } catch (error) {
      console.error('Failed to initialize app:', error);
      message.error('Failed to initialize app');
      setAppState(prev => ({ ...prev, loading: false }));
    }
  };

  // Open request in tab (single-click for temporary, double-click for persistent)
  const openRequestInTab = (request: HttpRequest, isPersistent: boolean = false) => {
    setAppState(prev => {
      const existingTabIndex = prev.openTabs.findIndex(t => t.requestId === request.id);
      let newTabs = [...prev.openTabs];
      
      if (existingTabIndex >= 0) {
        // Tab already exists
        const existingTab = newTabs[existingTabIndex];
        if (isPersistent && !existingTab.isPersistent) {
          // Convert temporary tab to persistent
          existingTab.isPersistent = true;
          existingTab.isTemporary = false;
        }
      } else {
        // New tab
        newTabs.push({
          requestId: request.id,
          request,
          isPersistent,
          isTemporary: !isPersistent,
        });
      }

      // If single-click and there's already a temporary tab, remove the old one
      if (!isPersistent) {
        const oldTemporaryIndex = newTabs.findIndex(t => t.isTemporary && t.requestId !== request.id);
        if (oldTemporaryIndex >= 0) {
          newTabs.splice(oldTemporaryIndex, 1);
        }
      }

      return {
        ...prev,
        openTabs: newTabs,
        currentRequest: request,
        activeTabId: request.id,
        response: null,
      };
    });
  };

  // Handle request click (single vs double click)
  const handleRequestClick = (request: HttpRequest, requestId: string) => {
    const now = Date.now();
    const lastTime = lastClickTime[requestId] || 0;
    const timeDiff = now - lastTime;

    // Clear existing timer for this request
    if (tabClickTimer[requestId]) {
      clearTimeout(tabClickTimer[requestId]);
    }

    if (timeDiff < 300) {
      // Double-click detected
      setLastClickTime(prev => ({ ...prev, [requestId]: 0 }));
      openRequestInTab(request, true); // Persistent
    } else {
      // Single-click - set up timer for potential double-click
      setLastClickTime(prev => ({ ...prev, [requestId]: now }));
      const timer = setTimeout(() => {
        openRequestInTab(request, false); // Temporary
      }, 300);
      setTabClickTimer(prev => ({ ...prev, [requestId]: timer }));
    }
  };

  // Close tab
  const closeTab = (requestId: string) => {
    setAppState(prev => {
      const newTabs = prev.openTabs.filter(t => t.requestId !== requestId);
      let newActiveTabId = prev.activeTabId;
      let newCurrentRequest = prev.currentRequest;

      if (prev.activeTabId === requestId) {
        // If closing active tab, switch to another tab or clear
        if (newTabs.length > 0) {
          newActiveTabId = newTabs[newTabs.length - 1].requestId;
          newCurrentRequest = newTabs[newTabs.length - 1].request;
        } else {
          newActiveTabId = null;
          newCurrentRequest = null;
        }
      }

      return {
        ...prev,
        openTabs: newTabs,
        activeTabId: newActiveTabId,
        currentRequest: newCurrentRequest,
        response: newCurrentRequest ? prev.response : null,
      };
    });
  };

  // Close all tabs
  const closeAllTabs = () => {
    setAppState(prev => ({
      ...prev,
      openTabs: [],
      activeTabId: null,
      currentRequest: null,
      response: null,
    }));
  };

  // Close other tabs
  const closeOtherTabs = (requestId: string) => {
    setAppState(prev => {
      const newTabs = prev.openTabs.filter(t => t.requestId === requestId);
      return {
        ...prev,
        openTabs: newTabs,
        activeTabId: requestId,
        currentRequest: prev.currentRequest?.id === requestId ? prev.currentRequest : newTabs[0]?.request || null,
      };
    });
  };

  // Create new request
  const createNewRequest = async () => {
    const newRequest: HttpRequest = {
      id: `req_${Date.now()}`,
      name: `New Request ${Date.now()}`,
      method: HttpMethod.GET,
      url: '',
      params: [],
      headers: [...(appState.settings?.defaultHeaders || [])],
      body: { type: BodyType.NONE },
      auth: { type: AuthType.NONE },
      scripts: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setAppState(prev => ({
      ...prev,
      currentRequest: newRequest,
      response: null,
    }));
  };

  // Send request
  const sendRequest = async () => {
    if (!appState.currentRequest) {
      message.error('No request selected');
      return;
    }

    if (!appState.currentRequest.url.trim()) {
      message.error('URL cannot be empty');
      return;
    }

    setAppState(prev => ({ ...prev, sending: true }));

    try {
      // Execute pre-request script
      if (appState.currentRequest.scripts?.preRequest) {
        const scriptResult = await scriptEngine.executePreRequestScript(
          appState.currentRequest.scripts.preRequest,
          {
            request: appState.currentRequest,
            variables: variableSystem.mergeVariables({
              global: appState.settings?.variables || [],
              collection: [],
              request: [],
            }),
            globals: appState.settings?.variables || [],
          }
        );

        if (!scriptResult.success) {
          message.error(`Pre-request script error: ${scriptResult.error}`);
          setAppState(prev => ({ ...prev, sending: false }));
          return;
        }
      }

      // Send request
      const controller = appState.requestAbortController || httpEngine.createAbortController();
      const result = await httpEngine.execute(appState.currentRequest, {
        timeout: appState.settings?.defaultTimeout || 30000,
        signal: controller.signal,
      });

      if (result.response) {
        // Execute post-response script
        if (appState.currentRequest.scripts?.postResponse) {
          await scriptEngine.executePostResponseScript(
            appState.currentRequest.scripts.postResponse,
            {
              request: appState.currentRequest,
              response: result.response,
              variables: variableSystem.mergeVariables({
                global: appState.settings?.variables || [],
                collection: [],
                request: [],
              }),
              globals: appState.settings?.variables || [],
            }
          );
        }

        // Add to history with curl and response data
        const historyEntry: HistoryEntry = {
          id: `hist_${Date.now()}`,
          method: appState.currentRequest.method,
          url: appState.currentRequest.url,
          name: appState.currentRequest.name,
          status: result.response.status,
          responseTime: result.response.responseTime,
          responseSize: result.response.responseSize,
          executedAt: Date.now(),
          curl: generateCurlCommand(appState.currentRequest),
          responseBody: result.response.body,
          responseHeaders: result.response.headers,
        };

        await indexedDBService.addHistoryEntry(historyEntry);

        // Limit history to 50 entries
        const newHistory = [historyEntry, ...appState.history.slice(0, 49)];
        
        // If history exceeds 50, delete the oldest entry from IndexedDB
        if (appState.history.length >= 50 && appState.history[49]) {
          try {
            await indexedDBService.deleteHistoryEntry(appState.history[49].id);
          } catch (err) {
            console.warn('Failed to delete old history entry:', err);
          }
        }

        setAppState(prev => ({
          ...prev,
          response: result.response || null,
          history: newHistory,
        }));

        message.success(`Request completed in ${result.response.responseTime.toFixed(2)}ms`);
      } else if (result.error) {
        // Clear response when request fails
        setAppState(prev => ({
          ...prev,
          response: null,
        }));
        
        // Handle different error types with specific messages
        if (result.error.code === 'INVALID_URL') {
          // Invalid URL format
          message.error(result.error.message);
        } else if (result.error.code === 'INVALID_REQUEST') {
          // HTTP specification violation
          message.error(result.error.message);
        } else if (result.error.code === 'OFFLINE_ERROR') {
          // Network offline
          message.error(result.error.message);
        } else if (result.error.code === 'NETWORK_ERROR') {
          // Network error (DNS, connection refused, etc.)
          message.error(result.error.message);
        } else if (result.error.code === 'CORS_ERROR') {
          // CORS-specific error
          Modal.warning({
            title: '跨域请求失败 (CORS)',
            width: 600,
            content: (
              <div>
                <p style={{ marginBottom: 12 }}>
                  浏览器因为<strong>CORS（跨域资源共享）</strong>安全政策阻止了这个请求。
                </p>
                <p style={{ marginBottom: 12, color: '#666' }}>
                  这是浏览器的安全限制，防止网页向不同源的服务器发送请求。
                </p>
                <p style={{ marginBottom: 12 }}>解决方案：</p>
                <ul style={{ marginLeft: 20, marginBottom: 12 }}>
                  <li>1. 检查API服务器是否配置了CORS响应头</li>
                  <li>2. 使用后端代理或API网关转发请求</li>
                  <li>3. 使用专业HTTP客户端（Postman、Insomnia等）</li>
                  <li>4. 使用浏览器开发者工具检查请求详情</li>
                </ul>
              </div>
            ),
            okText: '确定',
          });
        } else {
          // Generic error
          message.error(`请求失败: ${result.error.message}`);
        }
      }
    } catch (error: any) {
      // Clear response on request error
      setAppState(prev => ({
        ...prev,
        response: null,
      }));
      message.error(`Request error: ${error.message}`);
    } finally {
      setAppState(prev => ({ ...prev, sending: false }));
    }
  };

  // Update current request
  const updateCurrentRequest = (updates: Partial<HttpRequest>) => {
    if (!appState.currentRequest) return;

    const updated = {
      ...appState.currentRequest,
      ...updates,
      updatedAt: Date.now(),
    };

    setAppState(prev => ({
      ...prev,
      currentRequest: updated,
    }));
  };

  // Save request with name and folder
  const openSaveRequestModal = () => {
    if (!appState.currentRequest) {
      message.error('没有请求可以保存');
      return;
    }
    setAppState(prev => ({
      ...prev,
      showRequestNameModal: true,
      requestName: prev.currentRequest?.name || '',
      saveToCollectionId: prev.currentCollectionId,
    }));
  };

  const confirmSaveRequest = async () => {
    if (!appState.currentRequest) {
      message.error('没有请求可以保存');
      return;
    }

    if (!appState.requestName.trim()) {
      message.error('请输入请求名称');
      return;
    }

    if (!appState.saveToCollectionId) {
      message.error('请选择要保存的文件夹');
      return;
    }

    try {
      const requestToSave = {
        ...appState.currentRequest,
        name: appState.requestName,
        collectionId: appState.saveToCollectionId,
        updatedAt: Date.now(),
      };

      const existing = await indexedDBService.getRequest(appState.currentRequest.id);
      if (existing) {
        await indexedDBService.updateRequest(requestToSave);
        message.success('请求已更新');
      } else {
        await indexedDBService.createRequest(requestToSave);
        message.success('请求已保存');
      }

      // Update collectionRequests map to reflect real-time changes
      setAppState(prev => {
        const newCollectionRequests = new Map(prev.collectionRequests);
        const requests = newCollectionRequests.get(appState.saveToCollectionId!) || [];
        
        // Check if request already exists in the collection
        const existingIndex = requests.findIndex(r => r.id === requestToSave.id);
        if (existingIndex >= 0) {
          // Update existing request
          requests[existingIndex] = requestToSave;
        } else {
          // Add new request
          requests.push(requestToSave);
        }
        
        newCollectionRequests.set(appState.saveToCollectionId!, requests);
        
        return {
          ...prev,
          currentRequest: requestToSave,
          showRequestNameModal: false,
          requestName: '',
          collectionRequests: newCollectionRequests,
          // Auto-expand the collection when saving
          expandedCollections: new Set([...prev.expandedCollections, appState.saveToCollectionId!]),
        };
      });
    } catch (error: any) {
      message.error(`保存失败: ${error.message}`);
    }
  };

  // Save request
  const saveRequest = async () => {
    if (!appState.currentRequest) {
      message.error('没有请求可以保存');
      return;
    }

    // Check if request already has a name and collection assigned (already saved)
    const hasCollectionId = !!appState.currentRequest.collectionId;
    const hasCustomName = appState.currentRequest.name && !appState.currentRequest.name.startsWith('New Request');

    if (hasCollectionId && hasCustomName) {
      // Direct save - already has name and collection
      try {
        const requestToSave = {
          ...appState.currentRequest,
          updatedAt: Date.now(),
        };

        await indexedDBService.updateRequest(requestToSave);
        message.success('请求已更新');

        setAppState(prev => {
          const newCollectionRequests = new Map(prev.collectionRequests);
          if (requestToSave.collectionId) {
            const requests = newCollectionRequests.get(requestToSave.collectionId) || [];
            const index = requests.findIndex(r => r.id === requestToSave.id);
            if (index >= 0) {
              requests[index] = requestToSave;
              newCollectionRequests.set(requestToSave.collectionId, requests);
            }
          }
          return {
            ...prev,
            currentRequest: requestToSave,
            collectionRequests: newCollectionRequests,
          };
        });
      } catch (error: any) {
        message.error(`保存失败: ${error.message}`);
      }
    } else {
      // Show modal for new save
      openSaveRequestModal();
    }
  };

  // Cancel request
  const cancelRequest = () => {
    if (appState.requestAbortController) {
      appState.requestAbortController.abort();
      setAppState(prev => ({ ...prev, sending: false, requestAbortController: null }));
      message.info('Request cancelled');
    }
  };

  // Handle history selection - simply load saved response data
  const selectFromHistory = async (entry: HistoryEntry) => {
    try {
      // Create request from history entry
      let requestToLoad: HttpRequest | null = null;

      // If curl command is saved, parse it to get full request details
      if (entry.curl) {
        try {
          requestToLoad = importParserService.parseCurl(entry.curl);
        } catch (err) {
          console.warn('Could not parse curl, falling back to minimal request:', err);
        }
      }

      // Fallback: create minimal request from entry if curl parsing failed
      if (!requestToLoad) {
        requestToLoad = {
          id: `req_${Date.now()}`,
          name: entry.name,
          method: entry.method,
          url: entry.url,
          params: [],
          headers: [...(appState.settings?.defaultHeaders || [])],
          body: { type: BodyType.NONE },
          auth: { type: AuthType.NONE },
          scripts: {},
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      }

      // Create response from stored data
      let responseToLoad: HttpResponse | null = null;
      if (entry.responseBody !== undefined && entry.responseHeaders) {
        responseToLoad = {
          status: entry.status || 200,
          statusText: entry.status === 200 ? 'OK' : `Error ${entry.status}`,
          headers: entry.responseHeaders,
          body: entry.responseBody,
          bodyType: detectResponseLanguage(entry.responseBody, entry.responseHeaders['content-type'] || '') as any,
          responseTime: entry.responseTime || 0,
          responseSize: entry.responseSize || 0,
          receivedAt: entry.executedAt,
        };
      }

      setAppState(prev => ({
        ...prev,
        currentRequest: requestToLoad,
        response: responseToLoad,
      }));
    } catch (error) {
      console.error('Error loading history entry:', error);
      message.error('Failed to load history entry');
    }
  };

  // Create new collection
  const createNewCollection = async () => {
    if (!appState.newCollectionName.trim()) {
      message.error('文件夹名称不能为空');
      return;
    }

    const newCollection: Collection = {
      id: `col_${Date.now()}`,
      name: appState.newCollectionName,
      items: [],
      variables: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    try {
      await indexedDBService.createCollection(newCollection);
      setAppState(prev => ({
        ...prev,
        collections: [...prev.collections, newCollection],
        showCollectionModal: false,
        newCollectionName: '',
      }));
      message.success('文件夹创建成功');
    } catch (error: any) {
      message.error(`创建失败: ${error.message}`);
    }
  };

  // Toggle collection expansion
  const toggleCollectionExpand = async (collectionId: string) => {
    const isExpanded = appState.expandedCollections.has(collectionId);
    const newExpanded = new Set(appState.expandedCollections);
    if (isExpanded) {
      newExpanded.delete(collectionId);
    } else {
      newExpanded.add(collectionId);
    }
    setAppState(prev => ({
      ...prev,
      expandedCollections: newExpanded,
    }));
  };

  // Rename collection
  const renameCollection = async () => {
    if (!appState.editingCollectionId || !appState.editingCollectionName.trim()) {
      message.error('文件夹名称不能为空');
      return;
    }

    try {
      const collection = appState.collections.find(c => c.id === appState.editingCollectionId);
      if (collection) {
        const updated = {
          ...collection,
          name: appState.editingCollectionName,
          updatedAt: Date.now(),
        };
        await indexedDBService.updateCollection(updated);
        setAppState(prev => ({
          ...prev,
          collections: prev.collections.map(c => c.id === appState.editingCollectionId ? updated : c),
          editingCollectionId: null,
          editingCollectionName: '',
        }));
        message.success('文件夹已更新');
      }
    } catch (error: any) {
      message.error(`更新失败: ${error.message}`);
    }
  };

  // Delete collection
  const deleteCollection = async (collectionId: string) => {
    const collection = appState.collections.find(c => c.id === collectionId);
    const collectionName = collection?.name || '未知文件夹';

    Modal.confirm({
      title: '删除文件夹',
      content: (
        <div>
          <p>确定要删除文件夹 <strong>"{collectionName}"</strong> 吗？</p>
          <p style={{ color: '#ff4d4f', marginTop: 8, fontSize: 12 }}>
            ⚠️ 文件夹内的所有请求也将被删除。
          </p>
        </div>
      ),
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await indexedDBService.deleteCollection(collectionId);
          setAppState(prev => {
            const newExpanded = new Set(prev.expandedCollections);
            newExpanded.delete(collectionId);
            const newRequests = new Map(prev.collectionRequests);
            newRequests.delete(collectionId);
            return {
              ...prev,
              collections: prev.collections.filter(c => c.id !== collectionId),
              currentCollectionId: prev.currentCollectionId === collectionId ? null : prev.currentCollectionId,
              currentRequest: prev.currentRequest?.collectionId === collectionId ? null : prev.currentRequest,
              expandedCollections: newExpanded,
              collectionRequests: newRequests,
            };
          });
          message.success(`文件夹 "${collectionName}" 已删除`);
        } catch (error: any) {
          message.error(`删除失败: ${error.message}`);
        }
      },
    });
  };

  // Open edit request modal
  const openEditRequestModal = (request: HttpRequest, sourceCollectionId?: string) => {
    setAppState(prev => ({
      ...prev,
      showEditRequestModal: true,
      editRequestModalId: request.id,
      editRequestModalName: request.name,
      editRequestModalCollectionId: request.collectionId || sourceCollectionId || null,
      editRequestModalSourceCollectionId: sourceCollectionId || request.collectionId || null,
    }));
  };

  // Save edited request
  const saveEditedRequest = async () => {
    if (!appState.editRequestModalId || !appState.editRequestModalName?.trim()) {
      message.error('请求名称不能为空');
      return;
    }

    if (!appState.editRequestModalCollectionId) {
      message.error('请选择所属文件夹');
      return;
    }

    try {
      const request = appState.currentRequest && appState.currentRequest.id === appState.editRequestModalId
        ? appState.currentRequest
        : (appState.editRequestModalSourceCollectionId
            ? (appState.collectionRequests.get(appState.editRequestModalSourceCollectionId) || []).find(r => r.id === appState.editRequestModalId)
            : undefined);

      if (!request) {
        message.error('请求未找到');
        return;
      }

      const updated: HttpRequest = {
        ...request,
        name: appState.editRequestModalName,
        collectionId: appState.editRequestModalCollectionId,
        updatedAt: Date.now(),
      };

      await indexedDBService.updateRequest(updated);

      setAppState(prev => {
        const newCollectionRequests = new Map(prev.collectionRequests);
        
        // Remove from old collection if moved
        if (appState.editRequestModalSourceCollectionId && appState.editRequestModalSourceCollectionId !== appState.editRequestModalCollectionId) {
          const oldRequests = newCollectionRequests.get(appState.editRequestModalSourceCollectionId) || [];
          newCollectionRequests.set(
            appState.editRequestModalSourceCollectionId,
            oldRequests.filter(r => r.id !== appState.editRequestModalId)
          );
        }
        
        // Add to new collection
        const newRequests = newCollectionRequests.get(appState.editRequestModalCollectionId!) || [];
        const existingIndex = newRequests.findIndex(r => r.id === appState.editRequestModalId);
        if (existingIndex >= 0) {
          newRequests[existingIndex] = updated;
        } else {
          newRequests.push(updated);
        }
        newCollectionRequests.set(appState.editRequestModalCollectionId!, newRequests);
        
        return {
          ...prev,
          currentRequest: appState.editRequestModalId === prev.currentRequest?.id ? updated : prev.currentRequest,
          collectionRequests: newCollectionRequests,
          showEditRequestModal: false,
          editRequestModalId: null,
          editRequestModalName: '',
          editRequestModalCollectionId: null,
          editRequestModalSourceCollectionId: null,
          expandedCollections: new Set([...prev.expandedCollections, appState.editRequestModalCollectionId!]),
        };
      });
      
      message.success('请求已更新');
    } catch (error: any) {
      message.error(`更新失败: ${error.message}`);
    }
  };

  // Delete edited request
  const deleteEditedRequest = async () => {
    if (!appState.editRequestModalId) {
      message.error('请求未找到');
      return;
    }

    const requestName = appState.editRequestModalName || '未知请求';

    Modal.confirm({
      title: '确认删除',
      content: `确定要删除请求 "${requestName}" 吗？`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await indexedDBService.deleteRequest(appState.editRequestModalId!);
          
          setAppState(prev => {
            const newCollectionRequests = new Map(prev.collectionRequests);
            if (appState.editRequestModalSourceCollectionId) {
              const requests = newCollectionRequests.get(appState.editRequestModalSourceCollectionId) || [];
              newCollectionRequests.set(
                appState.editRequestModalSourceCollectionId,
                requests.filter(r => r.id !== appState.editRequestModalId)
              );
            }
            return {
              ...prev,
              collectionRequests: newCollectionRequests,
              currentRequest: prev.currentRequest?.id === appState.editRequestModalId ? null : prev.currentRequest,
              showEditRequestModal: false,
              editRequestModalId: null,
              editRequestModalName: '',
              editRequestModalCollectionId: null,
              editRequestModalSourceCollectionId: null,
            };
          });
          
          message.success(`请求 "${requestName}" 已删除`);
        } catch (error: any) {
          message.error(`删除失败: ${error.message}`);
        }
      },
    });
  };

  // Delete request wrapper
  const deleteRequest = (requestId: string, collectionId?: string) => {
    const request = appState.currentRequest && appState.currentRequest.id === requestId 
      ? appState.currentRequest 
      : (collectionId ? (appState.collectionRequests.get(collectionId) || []).find(r => r.id === requestId) : undefined);
    if (request) {
      openEditRequestModal(request, collectionId);
    }
  };

  // Clear history
  const clearAllHistory = async () => {
    Modal.confirm({
      title: '清空历史记录',
      content: '确定要清空所有历史记录吗？',
      okText: '确定',
      cancelText: '取消',
      onOk: async () => {
        try {
          await indexedDBService.deleteAllHistory();
          setAppState(prev => ({
            ...prev,
            history: [],
          }));
          message.success('历史记录已清空');
        } catch (error: any) {
          message.error(`清空失败: ${error.message}`);
        }
      },
    });
  };

  // Export collection
  const exportCollection = async () => {
    if (!appState.currentCollectionId) {
      message.error('请先选择一个文件夹');
      return;
    }

    try {
      const collection = await indexedDBService.getCollection(appState.currentCollectionId);
      if (collection) {
        const json = importExportService.exportCollectionAsJSON(collection);
        importExportService.downloadFile(json, `${collection.name}_${Date.now()}.json`);
        message.success('文件夹已导出');
      }
    } catch (error: any) {
      message.error(`导出失败: ${error.message}`);
    }
  };

  // Export request as curl
  const exportAsJson = async () => {
    if (!appState.currentRequest) {
      message.error('请先选择一个请求');
      return;
    }

    try {
      const json = importExportService.exportRequestAsJSON(appState.currentRequest);
      importExportService.downloadFile(json, `${appState.currentRequest.name}_${Date.now()}.json`);
      message.success('请求已导出');
    } catch (error: any) {
      message.error(`导出失败: ${error.message}`);
    }
  };

  // Export request as curl
  const exportAsCurl = async () => {
    if (!appState.currentRequest) {
      message.error('请先选择一个请求');
      return;
    }

    try {
      const curl = importExportService.exportRequestAsCurl(appState.currentRequest);
      await importExportService.copyToClipboard(curl);
      message.success('Curl 命令已复制到剪贴板');
    } catch (error: any) {
      message.error(`复制失败: ${error.message}`);
    }
  };

  // Import from file
  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      const data = JSON.parse(content);

      // Try to import as collection first, then as request
      if (data.items) {
        const collection = await importExportService.importCollectionFromJSON(content);
        await indexedDBService.createCollection(collection);
        setAppState(prev => ({
          ...prev,
          collections: [...prev.collections, collection],
          showImportModal: false,
        }));
        message.success('文件夹导入成功');
      } else if (data.method && data.url) {
        const request = importParserService.parseJson(content);
        setAppState(prev => ({
          ...prev,
          currentRequest: request,
          showImportModal: false,
        }));
        message.success('请求导入成功，请检查并保存');
      } else {
        // Try parsing as generic request
        const request = importParserService.parseJson(content);
        setAppState(prev => ({
          ...prev,
          currentRequest: request,
          showImportModal: false,
        }));
        message.success('请求导入成功，请检查并保存');
      }
    } catch (error: any) {
      message.error(`导入失败: ${error.message}`);
    }
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Import curl
  const handleImportCurl = () => {
    Modal.confirm({
      title: '导入 Curl 命令',
      width: 800,
      content: (
        <Input.TextArea
          id="curl-input"
          placeholder="粘贴你的 curl 命令..."
          rows={16}
          style={{ fontSize: 13, fontFamily: 'monospace' }}
        />
      ),
      okText: '导入',
      cancelText: '取消',
      onOk: async () => {
        const curInput = document.getElementById('curl-input') as HTMLTextAreaElement;
        if (curInput) {
          const curl = curInput.value;
          if (!curl.trim()) {
            message.error('请输入 curl 命令');
            return;
          }
          try {
            const request = importParserService.parseCurl(curl);
            setAppState(prev => ({
              ...prev,
              currentRequest: request,
            }));
            message.success('Curl 命令导入成功，请检查并保存');
          } catch (error: any) {
            message.error(`导入失败: ${error.message}`);
          }
        }
      },
    });
  };

  // Helper: Parse URL query params
  const parseUrlParams = (url: string): KeyValuePair[] => {
    try {
      const urlObj = new URL(url);
      const params: KeyValuePair[] = [];
      urlObj.searchParams.forEach((value, key) => {
        params.push({
          id: `param_${Date.now()}_${Math.random()}`,
          key,
          value,
          enabled: true,
        });
      });
      return params;
    } catch {
      return [];
    }
  };

  // Helper: Build URL from base URL and params
  const buildUrlFromParams = (baseUrl: string, params: KeyValuePair[]): string => {
    try {
      const urlObj = new URL(baseUrl);
      urlObj.search = '';
      params.forEach(param => {
        if (param.enabled && param.key) {
          urlObj.searchParams.append(param.key, param.value);
        }
      });
      return urlObj.toString();
    } catch {
      return baseUrl;
    }
  };

  // Helper: Add new param
  const addParam = () => {
    if (!appState.currentRequest) return;
    const newParam: KeyValuePair = {
      id: `param_${Date.now()}_${Math.random()}`,
      key: '',
      value: '',
      enabled: true,
      description: '',
    };
    updateCurrentRequest({
      params: [...(appState.currentRequest.params || []), newParam],
    });
  };

  // Helper: Update param
  const updateParam = (index: number, updates: Partial<KeyValuePair>) => {
    if (!appState.currentRequest) return;
    const newParams = [...appState.currentRequest.params];
    newParams[index] = { ...newParams[index], ...updates };
    
    const baseUrl = appState.currentRequest.url.split('?')[0];
    const newUrl = buildUrlFromParams(baseUrl, newParams);
    
    updateCurrentRequest({
      params: newParams,
      url: newUrl,
    });
  };

  // Helper: Toggle param enabled state
  const toggleParamEnabled = (index: number) => {
    if (!appState.currentRequest) return;
    const newParams = [...appState.currentRequest.params];
    newParams[index].enabled = !newParams[index].enabled;
    
    const baseUrl = appState.currentRequest.url.split('?')[0];
    const newUrl = buildUrlFromParams(baseUrl, newParams);
    
    updateCurrentRequest({
      params: newParams,
      url: newUrl,
    });
  };

  // Helper: Remove param
  const removeParam = (index: number) => {
    if (!appState.currentRequest) return;
    const newParams = appState.currentRequest.params.filter((_, i) => i !== index);
    
    const baseUrl = appState.currentRequest.url.split('?')[0];
    const newUrl = buildUrlFromParams(baseUrl, newParams);
    
    updateCurrentRequest({
      params: newParams,
      url: newUrl,
    });
  };

  // Helper: Sync URL changes to params
  const syncUrlToParams = (url: string) => {
    if (!appState.currentRequest) return;
    try {
      const newParams = parseUrlParams(url);
      if (newParams.length > 0) {
        updateCurrentRequest({
          url,
          params: newParams,
        });
      } else {
        updateCurrentRequest({ url });
      }
    } catch {
      updateCurrentRequest({ url });
    }
  };

  // Helper: Add new header
  const addHeader = () => {
    if (!appState.currentRequest) return;
    const newHeader: KeyValuePair = {
      id: `header_${Date.now()}_${Math.random()}`,
      key: '',
      value: '',
      enabled: true,
      description: '',
    };
    updateCurrentRequest({
      headers: [...(appState.currentRequest.headers || []), newHeader],
    });
  };

  // Helper: Update header
  const updateHeader = (index: number, updates: Partial<KeyValuePair>) => {
    if (!appState.currentRequest) return;
    const newHeaders = [...appState.currentRequest.headers];
    newHeaders[index] = { ...newHeaders[index], ...updates };
    updateCurrentRequest({
      headers: newHeaders,
    });
  };

  // Helper: Toggle header enabled state
  const toggleHeaderEnabled = (index: number) => {
    if (!appState.currentRequest) return;
    const newHeaders = [...appState.currentRequest.headers];
    newHeaders[index].enabled = !newHeaders[index].enabled;
    updateCurrentRequest({
      headers: newHeaders,
    });
  };

  // Helper: Remove header
  const removeHeader = (index: number) => {
    if (!appState.currentRequest) return;
    const newHeaders = appState.currentRequest.headers.filter((_, i) => i !== index);
    updateCurrentRequest({
      headers: newHeaders,
    });
  };

  if (appState.loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin tip="Loading..." />
      </div>
    );
  }

  return (
    <Layout style={{ height: '100vh', flexDirection: 'column' }}>
      {/* Header */}
      <Header
        style={{
          background: '#fff',
          borderBottom: '1px solid #f0f0f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <h2 style={{ margin: 0 }}>🔧 API 调试工具</h2>
        </div>

        <Space>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={createNewRequest}
          >
            新建请求
          </Button>
          <Dropdown menu={{
            items: [
              { key: 'json', label: '导入 JSON' },
              { key: 'curl', label: '导入 Curl' },
            ],
            onClick: (e) => {
              if (e.key === 'json') {
                fileInputRef.current?.click();
              } else if (e.key === 'curl') {
                handleImportCurl();
              }
            },
          }}>
            <Button icon={<UploadOutlined />}>导入</Button>
          </Dropdown>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={handleImportFile}
          />
          <Dropdown menu={{
            items: [
              { key: 'json', label: '请求 (JSON)' },
              { key: 'curl', label: '请求 (Curl)' },
              { key: 'collection', label: '文件夹 (JSON)' },
            ],
            onClick: (e) => {
              if (e.key === 'json') {
                exportAsJson();
              } else if (e.key === 'curl') {
                exportAsCurl();
              } else if (e.key === 'collection') {
                exportCollection();
              }
            },
          }}>
            <Button icon={<DownloadOutlined />}>导出</Button>
          </Dropdown>
          <Button icon={<SettingOutlined />} onClick={() => setAppState(prev => ({ ...prev, showSettingsModal: true }))}>设置</Button>
        </Space>
      </Header>

      {/* Main Content */}
      <Layout style={{ flex: 1, overflow: 'hidden' }}>
        {/* Left Sidebar - Collections & History */}
        <Sider
          width={280}
          style={{
            background: '#fafafa',
            borderRight: '1px solid #f0f0f0',
            overflow: 'auto',
          }}
        >
          <Tabs defaultActiveKey="collections" style={{ height: '100%' }}>
            <TabPane
              tab={<span><FolderOutlined /> 文件夹</span>}
              key="collections"
            >
              <div style={{ padding: '10px 0' }}>
                <Button
                  type="dashed"
                  block
                  icon={<PlusOutlined />}
                  style={{ marginBottom: 10 }}
                  onClick={() => setAppState(prev => ({ ...prev, showCollectionModal: true }))}
                >
                  新建文件夹
                </Button>

                {appState.collections.length === 0 ? (
                  <Empty description="暂无文件夹" />
                ) : (
                  <div>
                    {appState.collections.map((collection) => {
                      const isExpanded = appState.expandedCollections.has(collection.id);
                      const requests = appState.collectionRequests.get(collection.id) || [];
                      const isEditing = appState.editingCollectionId === collection.id;

                      return (
                        <div key={collection.id} style={{ marginBottom: 4 }}>
                          <div
                            style={{
                              padding: '8px 12px',
                              borderRadius: 4,
                              background: appState.currentCollectionId === collection.id ? '#e6f7ff' : '#fafafa',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              cursor: 'pointer',
                            }}
                          >
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleCollectionExpand(collection.id);
                              }}
                              style={{ cursor: 'pointer', flex: '0 0 auto' }}
                            >
                              {requests.length > 0 && (
                                isExpanded ? <CaretDownOutlined /> : <CaretRightOutlined />
                              )}
                            </span>
                            {isEditing ? (
                              <Input
                                size="small"
                                value={appState.editingCollectionName}
                                onChange={(e) => setAppState(prev => ({
                                  ...prev,
                                  editingCollectionName: e.target.value,
                                }))}
                                onClick={(e) => e.stopPropagation()}
                                onPressEnter={() => renameCollection()}
                                onBlur={() => renameCollection()}
                                autoFocus
                                style={{ flex: 1 }}
                              />
                            ) : (
                              <>
                                <FolderOutlined style={{ marginRight: 4 }} />
                                <span
                                  style={{ flex: 1 }}
                                  onClick={() => setAppState(prev => ({
                                    ...prev,
                                    currentCollectionId: collection.id,
                                  }))}
                                >
                                  {collection.name}
                                </span>
                              </>
                            )}
                            <div style={{ display: 'flex', gap: 4, flex: '0 0 auto' }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {!isEditing && (
                                <>
                                  <Tooltip title="重命名">
                                    <Button
                                      type="text"
                                      size="small"
                                      icon={<EditOutlined />}
                                      onClick={() => setAppState(prev => ({
                                        ...prev,
                                        editingCollectionId: collection.id,
                                        editingCollectionName: collection.name,
                                      }))}
                                    />
                                  </Tooltip>
                                  <Tooltip title="删除">
                                    <Button
                                      type="text"
                                      size="small"
                                      danger
                                      icon={<DeleteOutlined />}
                                      onClick={() => deleteCollection(collection.id)}
                                    />
                                  </Tooltip>
                                </>
                              )}
                            </div>
                          </div>

                          {isExpanded && requests.length > 0 && (
                            <div style={{ paddingLeft: 24, marginTop: 4 }}>
                              {requests.map((request) => {
                                return (
                                  <div
                                    key={request.id}
                                    style={{
                                      padding: '6px 8px',
                                      borderRadius: 4,
                                      background: appState.currentRequest?.id === request.id ? '#e6f7ff' : '#fff',
                                      border: '1px solid #f0f0f0',
                                      marginBottom: 2,
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 6,
                                      cursor: 'pointer',
                                    }}
                                  >
                                    <Badge
                                      status={request.method === 'GET' ? 'success' : 'processing'}
                                      style={{ flex: '0 0 auto' }}
                                    />
                                    <span
                                      style={{ flex: 1, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                      onClick={() => handleRequestClick(request, request.id)}
                                    >
                                      {request.name}
                                    </span>
                                    <div
                                      style={{ display: 'flex', gap: 2, flex: '0 0 auto' }}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <Tooltip title="编辑">
                                        <Button
                                          type="text"
                                          size="small"
                                          icon={<EditOutlined />}
                                          onClick={() => openEditRequestModal(request, collection.id)}
                                        />
                                      </Tooltip>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </TabPane>

            <TabPane
              tab={<span><ClockCircleOutlined /> 历史</span>}
              key="history"
            >
              <div style={{ padding: '10px 0' }}>
                <Button
                  type="dashed"
                  danger
                  block
                  icon={<DeleteOutlined />}
                  size="small"
                  style={{ marginBottom: 10 }}
                  onClick={clearAllHistory}
                >
                  清空历史
                </Button>

                {appState.history.length === 0 ? (
                  <Empty description="暂无历史记录" />
                ) : (
                  <List
                    size="small"
                    dataSource={appState.history}
                    renderItem={(entry) => (
                      <List.Item
                        style={{
                          padding: '8px 12px',
                          cursor: 'pointer',
                          borderRadius: 4,
                          marginBottom: 4,
                          background: selectedHistoryId === entry.id ? '#e6f7ff' : 'transparent',
                        }}
                        onClick={() => {
                          setSelectedHistoryId(entry.id);
                          selectFromHistory(entry);
                        }}
                      >
                        <div style={{ width: '100%' }}>
                          <div style={{ fontSize: 12 }}>
                            <Badge
                              status={entry.status && entry.status >= 200 && entry.status < 300 ? 'success' : 'error'}
                              text={`${entry.method} ${entry.status || '?'}`}
                            />
                          </div>
                          <div style={{ fontSize: 11, color: '#999', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {entry.url}
                          </div>
                        </div>
                      </List.Item>
                    )}
                  />
                )}
              </div>
            </TabPane>
          </Tabs>
        </Sider>

        {/* Right Content Area */}
        <Layout style={{ flex: 1, overflow: 'hidden', flexDirection: 'column' }}>
          {/* Request Tabs */}
          {appState.openTabs.length > 0 && (
            <div style={{ background: '#fff', borderBottom: '1px solid #f0f0f0', padding: '0 12px', display: 'flex', alignItems: 'center', gap: 4, height: 48, overflow: 'auto', flexShrink: 0 }}>
              {appState.openTabs.map((tab) => (
                <div
                  key={tab.requestId}
                  style={{
                    padding: '6px 12px',
                    background: appState.activeTabId === tab.requestId ? '#fff' : '#fafafa',
                    border: '1px solid #f0f0f0',
                    borderRadius: '4px 4px 0 0',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    whiteSpace: 'nowrap',
                    maxWidth: 200,
                  }}
                  onClick={() => setAppState(prev => ({
                    ...prev,
                    currentRequest: tab.request,
                    activeTabId: tab.requestId,
                  }))}
                >
                  <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {tab.request.name}
                  </span>
                  {!tab.isPersistent && (
                    <span style={{ fontSize: 10, color: '#999' }}>●</span>
                  )}
                  <Button
                    type="text"
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(tab.requestId);
                    }}
                    style={{ padding: 0, height: 20, width: 20 }}
                  />
                </div>
              ))}
              <Button
                type="text"
                size="small"
                onClick={closeAllTabs}
                style={{ marginLeft: 'auto' }}
              >
                关闭全部
              </Button>
            </div>
          )}
          {/* Main Content */}
          <Content style={{ flex: 1, overflow: 'auto', background: '#fff' }}>
          {!appState.currentRequest ? (
            <Empty
              description="选择或创建一个请求开始"
              style={{ marginTop: 100 }}
            />
          ) : (
            <div style={{ display: 'flex', gap: 24, height: '100%', overflow: 'hidden', padding: '0 20px 0 20px' }}>
              {/* Left - Request Editor */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* Request Bar - Postman Style */}
                <div style={{ padding: '12px 0', background: '#fff', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                  <Select
                    value={appState.currentRequest.method}
                    onChange={(method) => updateCurrentRequest({ method })}
                    style={{ width: 80 }}
                  >
                    {Object.values(HttpMethod).map((m: string) => (
                      <Select.Option key={m} value={m}>{m}</Select.Option>
                    ))}
                  </Select>
                  <Input
                    placeholder="https://api.example.com/endpoint"
                    value={appState.currentRequest.url}
                    onChange={(e) => syncUrlToParams(e.target.value)}
                    allowClear
                    style={{ flex: 1 }}
                    onPressEnter={sendRequest}
                  />
                  <Button
                    type="primary"
                    icon={<SendOutlined />}
                    loading={appState.sending}
                    onClick={sendRequest}
                    danger={appState.sending}
                    style={{ minWidth: 80 }}
                  >
                    {appState.sending ? '取消' : '发送'}
                  </Button>
                  <Button
                    icon={<SaveOutlined />}
                    onClick={saveRequest}
                  >
                    保存
                  </Button>
                  <Button
                    icon={<CopyOutlined />}
                    onClick={() => {
                      const curlCmd = generateCurlCommand(appState.currentRequest!);
                      navigator.clipboard.writeText(curlCmd).then(() => {
                        message.success('cURL 命令已复制到剪贴板');
                      }).catch(err => {
                        console.error('Failed to copy:', err);
                        message.error('复制失败');
                      });
                    }}
                  >
                    导出cURL
                  </Button>
                </div>

                {/* Tabs Section */}
                <Tabs
                  activeKey={activeTab}
                  onChange={setActiveTab}
                  style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
                  tabBarStyle={{ margin: 0, borderBottom: '1px solid #f0f0f0', background: '#fafafa', flexShrink: 0 }}
                  className="api-debug-tabs"
                >
                  <TabPane tab="Params" key="params" style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ padding: '16px 0' }}>
                      <Button
                        type="dashed"
                        icon={<PlusOutlined />}
                        size="small"
                        style={{ marginBottom: 16 }}
                        onClick={addParam}
                      >
                        添加参数
                      </Button>
                      {appState.currentRequest.params && appState.currentRequest.params.length > 0 ? (
                        <div style={{ border: '1px solid #d9d9d9', borderRadius: 4, overflow: 'hidden' }}>
                          {/* Header */}
                          <div style={{ padding: '8px 12px', background: '#fafafa', display: 'grid', gridTemplateColumns: '50px 1fr 1fr 1fr 40px', gap: 12, alignItems: 'center', fontSize: 12, fontWeight: 'bold', borderBottom: '1px solid #d9d9d9' }}>
                            <span></span>
                            <span>Key</span>
                            <span>Value</span>
                            <span>Description</span>
                            <span></span>
                          </div>
                          {/* Rows */}
                          {appState.currentRequest.params.map((param, idx) => (
                            <div key={param.id} style={{ padding: '8px 12px', borderBottom: idx < appState.currentRequest!.params.length - 1 ? '1px solid #f0f0f0' : 'none', display: 'grid', gridTemplateColumns: '50px 1fr 1fr 1fr 40px', gap: 12, alignItems: 'center', fontSize: 12 }}>
                              <input
                                type="checkbox"
                                checked={param.enabled}
                                onChange={() => toggleParamEnabled(idx)}
                                style={{ cursor: 'pointer' }}
                              />
                              <Input
                                size="small"
                                placeholder="Parameter key"
                                value={param.key}
                                onChange={(e) => updateParam(idx, { key: e.target.value })}
                                style={{ fontFamily: 'monospace' }}
                              />
                              <Input
                                size="small"
                                placeholder="Parameter value"
                                value={param.value}
                                onChange={(e) => updateParam(idx, { value: e.target.value })}
                                style={{ fontFamily: 'monospace' }}
                              />
                              <Input
                                size="small"
                                placeholder="Description"
                                value={param.description || ''}
                                onChange={(e) => updateParam(idx, { description: e.target.value })}
                              />
                              <Button
                                type="text"
                                size="small"
                                danger
                                icon={<DeleteOutlined />}
                                onClick={() => removeParam(idx)}
                              />
                            </div>
                          ))}
                          {/* Add row template */}
                          <div style={{ padding: '8px 12px', background: '#fafafa', display: 'grid', gridTemplateColumns: '50px 1fr 1fr 1fr 40px', gap: 12, alignItems: 'center', fontSize: 12, color: '#999', borderTop: '1px solid #f0f0f0' }}>
                            <span></span>
                            <span style={{ color: '#bfbfbf' }}>Key</span>
                            <span style={{ color: '#bfbfbf' }}>Value</span>
                            <span style={{ color: '#bfbfbf' }}>Description</span>
                            <span></span>
                          </div>
                        </div>
                      ) : (
                        <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>No parameters</div>
                      )}
                    </div>
                  </TabPane>

                  <TabPane tab="Headers" key="headers" style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ padding: '16px', height: '100%', overflow: 'auto' }}>
                      <Button
                        type="dashed"
                        icon={<PlusOutlined />}
                        size="small"
                        style={{ marginBottom: 16 }}
                        onClick={addHeader}
                      >
                        添加请求头
                      </Button>
                      {appState.currentRequest.headers && appState.currentRequest.headers.length > 0 ? (
                        <div style={{ border: '1px solid #d9d9d9', borderRadius: 4, overflow: 'hidden' }}>
                          {/* Header */}
                          <div style={{ padding: '8px 12px', background: '#fafafa', display: 'grid', gridTemplateColumns: '50px 1fr 1fr 1fr 40px', gap: 12, alignItems: 'center', fontSize: 12, fontWeight: 'bold', borderBottom: '1px solid #d9d9d9' }}>
                            <span></span>
                            <span>Key</span>
                            <span>Value</span>
                            <span>Description</span>
                            <span></span>
                          </div>
                          {/* Rows */}
                          {appState.currentRequest.headers.map((header, idx) => (
                            <div key={header.id} style={{ padding: '8px 12px', borderBottom: idx < appState.currentRequest!.headers.length - 1 ? '1px solid #f0f0f0' : 'none', display: 'grid', gridTemplateColumns: '50px 1fr 1fr 1fr 40px', gap: 12, alignItems: 'center', fontSize: 12 }}>
                              <input
                                type="checkbox"
                                checked={header.enabled}
                                onChange={() => toggleHeaderEnabled(idx)}
                                style={{ cursor: 'pointer' }}
                              />
                              <Input
                                size="small"
                                placeholder="Header key"
                                value={header.key}
                                onChange={(e) => updateHeader(idx, { key: e.target.value })}
                                style={{ fontFamily: 'monospace' }}
                              />
                              <Input
                                size="small"
                                placeholder="Header value"
                                value={header.value}
                                onChange={(e) => updateHeader(idx, { value: e.target.value })}
                                style={{ fontFamily: 'monospace' }}
                              />
                              <Input
                                size="small"
                                placeholder="Description"
                                value={header.description || ''}
                                onChange={(e) => updateHeader(idx, { description: e.target.value })}
                              />
                              <Button
                                type="text"
                                size="small"
                                danger
                                icon={<DeleteOutlined />}
                                onClick={() => removeHeader(idx)}
                              />
                            </div>
                          ))}
                          {/* Add row template */}
                          <div style={{ padding: '8px 12px', background: '#fafafa', display: 'grid', gridTemplateColumns: '50px 1fr 1fr 1fr 40px', gap: 12, alignItems: 'center', fontSize: 12, color: '#999', borderTop: '1px solid #f0f0f0' }}>
                            <span></span>
                            <span style={{ color: '#bfbfbf' }}>Key</span>
                            <span style={{ color: '#bfbfbf' }}>Value</span>
                            <span style={{ color: '#bfbfbf' }}>Description</span>
                            <span></span>
                          </div>
                        </div>
                      ) : (
                        <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>No headers</div>
                      )}
                    </div>
                  </TabPane>

                  <TabPane tab="Body" key="body" style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%', overflow: 'hidden', padding: '12px 16px' }}>
                      <div style={{ flexShrink: 0 }}>
                        <label style={{ display: 'block', marginBottom: 12, fontWeight: 'bold' }}>Body Type</label>
                        <Radio.Group
                          value={appState.currentRequest?.body.type}
                          onChange={(e) => updateCurrentRequest({
                            body: { ...appState.currentRequest!.body, type: e.target.value }
                          })}
                          style={{ display: 'flex', gap: 16 }}
                        >
                          {Object.values(BodyType).map((t: string) => (
                            <Radio key={t} value={t}>{t}</Radio>
                          ))}
                        </Radio.Group>
                      </div>

                      {appState.currentRequest?.body.type === BodyType.RAW && (
                        <>
                          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexShrink: 0 }}>
                            <label style={{ fontWeight: 'bold', margin: 0 }}>Format:</label>
                            <Radio.Group
                              value={appState.currentRequest?.body.raw?.format || RawBodyFormat.JSON}
                            onChange={(e) => updateCurrentRequest({
                              body: {
                                ...appState.currentRequest!.body,
                                raw: {
                                  ...appState.currentRequest!.body.raw,
                                  format: e.target.value,
                                  content: appState.currentRequest!.body.raw?.content || '',
                                },
                              },
                            })}
                              style={{ display: 'flex', gap: 16 }}
                            >
                              <Radio value={RawBodyFormat.JSON}>JSON</Radio>
                              <Radio value={RawBodyFormat.XML}>XML</Radio>
                              <Radio value={RawBodyFormat.TEXT}>HTML</Radio>
                            </Radio.Group>
                            <Button
                              type="primary"
                              size="small"
                              onClick={() => {
                                const content = appState.currentRequest?.body.raw?.content || '';
                                const format = appState.currentRequest?.body.raw?.format || RawBodyFormat.JSON;
                                let formatted = content;
                                
                                try {
                                  if (format === RawBodyFormat.JSON) {
                                    const parsed = JSON.parse(content);
                                    formatted = JSON.stringify(parsed, null, 2);
                                  } else if (format === RawBodyFormat.XML) {
                                    // Simple XML formatting
                                    formatted = content
                                      .replace(/></g, '>\n<')
                                      .replace(/^\s*</, '<');
                                    // Add indentation
                                    let indent = 0;
                                    formatted = formatted.split('\n').map((line) => {
                                      const trimmed = line.trim();
                                      if (trimmed.startsWith('</')) indent = Math.max(0, indent - 1);
                                      const indented = '  '.repeat(indent) + trimmed;
                                      if (trimmed.startsWith('<') && !trimmed.startsWith('</') && !trimmed.endsWith('/>')) {
                                        indent++;
                                      }
                                      return indented;
                                    }).join('\n');
                                  }
                                  
                                  updateCurrentRequest({
                                    body: {
                                      ...appState.currentRequest!.body,
                                      raw: {
                                        format: appState.currentRequest!.body.raw?.format || RawBodyFormat.JSON,
                                        content: formatted,
                                      },
                                    },
                                  });
                                  message.success('Formatted successfully!');
                                } catch (error) {
                                  message.error('Failed to format: ' + (error as Error).message);
                                }
                              }}
                            >
                              Format
                            </Button>
                          </div>
                          <div style={{ height: 800, overflow: 'hidden', background: '#fff', border: '1px solid #d9d9d9', borderRadius: 4 }}>
                          <Editor
                            onMount={(editor) => { bodyEditorRef.current = editor; }}
                            height="100%"
                            width="100%"
                            language={detectLanguage(appState.currentRequest?.body.raw?.content || '')}
                            value={appState.currentRequest?.body.raw?.content || ''}
                            onChange={(value) => updateCurrentRequest({
                              body: {
                                ...appState.currentRequest!.body,
                                raw: {
                                  format: appState.currentRequest!.body.raw?.format || RawBodyFormat.JSON,
                                  content: value || '',
                                },
                              },
                            })}
                            theme="vs-light"
                            options={{
                              minimap: { enabled: false },
                              fontSize: 14,
                              lineNumbers: 'on',
                              wordWrap: 'on',
                              formatOnPaste: true,
                              formatOnType: true,
                              padding: { top: 10, bottom: 10 },
                            }}
                          />
                        </div>
                        </>
                      )}
                      
                      {appState.currentRequest?.body.type === BodyType.FORM_DATA && (
                        <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                          <Button
                            type="dashed"
                            icon={<PlusOutlined />}
                            size="small"
                            style={{ marginBottom: 12 }}
                            onClick={() => {
                              const newFormData = [...(appState.currentRequest?.body.formData || [])];
                              newFormData.push({
                                id: `form_${Date.now()}_${Math.random()}`,
                                key: '',
                                value: '',
                                enabled: true,
                              });
                              updateCurrentRequest({
                                body: {
                                  ...appState.currentRequest!.body,
                                  formData: newFormData,
                                },
                              });
                            }}
                          >
                            添加 Form 字段
                          </Button>
                          {appState.currentRequest?.body.formData && appState.currentRequest.body.formData.length > 0 ? (
                            <div style={{ border: '1px solid #d9d9d9', borderRadius: 4, overflow: 'hidden' }}>
                              {/* Header */}
                              <div style={{ padding: '8px 12px', background: '#fafafa', display: 'grid', gridTemplateColumns: '50px 1fr 1fr 40px', gap: 12, alignItems: 'center', fontSize: 12, fontWeight: 'bold', borderBottom: '1px solid #d9d9d9' }}>
                                <span></span>
                                <span>Key</span>
                                <span>Value</span>
                                <span></span>
                              </div>
                              {/* Rows */}
                              {appState.currentRequest.body.formData.map((item, idx) => (
                                <div key={item.id} style={{ padding: '8px 12px', borderBottom: idx < appState.currentRequest!.body.formData!.length - 1 ? '1px solid #f0f0f0' : 'none', display: 'grid', gridTemplateColumns: '50px 1fr 1fr 40px', gap: 12, alignItems: 'center', fontSize: 12 }}>
                                  <input
                                    type="checkbox"
                                    checked={item.enabled}
                                    onChange={() => {
                                      const updated = [...appState.currentRequest!.body.formData!];
                                      const itemIndex = updated.findIndex(f => f.id === item.id);
                                      if (itemIndex >= 0) {
                                        updated[itemIndex] = { ...updated[itemIndex], enabled: !updated[itemIndex].enabled };
                                        updateCurrentRequest({ body: { ...appState.currentRequest!.body, formData: updated } });
                                      }
                                    }}
                                    style={{ cursor: 'pointer' }}
                                  />
                                  <Input
                                    size="small"
                                    placeholder="Field name"
                                    value={item.key}
                                    onChange={(e) => {
                                      const updated = [...appState.currentRequest!.body.formData!];
                                      const itemIndex = updated.findIndex(f => f.id === item.id);
                                      if (itemIndex >= 0) {
                                        updated[itemIndex] = { ...updated[itemIndex], key: e.target.value };
                                        updateCurrentRequest({ body: { ...appState.currentRequest!.body, formData: updated } });
                                      }
                                    }}
                                    style={{ fontFamily: 'monospace' }}
                                  />
                                  <Input
                                    size="small"
                                    placeholder="Field value"
                                    value={item.value}
                                    onChange={(e) => {
                                      const updated = [...appState.currentRequest!.body.formData!];
                                      const itemIndex = updated.findIndex(f => f.id === item.id);
                                      if (itemIndex >= 0) {
                                        updated[itemIndex] = { ...updated[itemIndex], value: e.target.value };
                                        updateCurrentRequest({ body: { ...appState.currentRequest!.body, formData: updated } });
                                      }
                                    }}
                                    style={{ fontFamily: 'monospace' }}
                                  />
                                  <Button
                                    type="text"
                                    size="small"
                                    danger
                                    icon={<DeleteOutlined />}
                                    onClick={() => {
                                      const updated = appState.currentRequest!.body.formData!.filter(f => f.id !== item.id);
                                      updateCurrentRequest({ body: { ...appState.currentRequest!.body, formData: updated } });
                                    }}
                                  />
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>No form data</div>
                          )}
                        </div>
                      )}
                      
                      {appState.currentRequest?.body.type === BodyType.X_FORM_URLENCODED && (
                        <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                          <Button
                            type="dashed"
                            icon={<PlusOutlined />}
                            size="small"
                            style={{ marginBottom: 12 }}
                            onClick={() => {
                              const newUrlencoded = [...(appState.currentRequest?.body.urlencoded || [])];
                              newUrlencoded.push({
                                id: `url_${Date.now()}_${Math.random()}`,
                                key: '',
                                value: '',
                                enabled: true,
                              });
                              updateCurrentRequest({
                                body: {
                                  ...appState.currentRequest!.body,
                                  urlencoded: newUrlencoded,
                                },
                              });
                            }}
                          >
                            添加字段
                          </Button>
                          {appState.currentRequest?.body.urlencoded && appState.currentRequest.body.urlencoded.length > 0 ? (
                            <div style={{ border: '1px solid #d9d9d9', borderRadius: 4, overflow: 'hidden' }}>
                              {/* Header */}
                              <div style={{ padding: '8px 12px', background: '#fafafa', display: 'grid', gridTemplateColumns: '50px 1fr 1fr 40px', gap: 12, alignItems: 'center', fontSize: 12, fontWeight: 'bold', borderBottom: '1px solid #d9d9d9' }}>
                                <span></span>
                                <span>Key</span>
                                <span>Value</span>
                                <span></span>
                              </div>
                              {/* Rows */}
                              {appState.currentRequest.body.urlencoded.map((item, idx) => (
                                <div key={item.id} style={{ padding: '8px 12px', borderBottom: idx < appState.currentRequest!.body.urlencoded!.length - 1 ? '1px solid #f0f0f0' : 'none', display: 'grid', gridTemplateColumns: '50px 1fr 1fr 40px', gap: 12, alignItems: 'center', fontSize: 12 }}>
                                  <input
                                    type="checkbox"
                                    checked={item.enabled}
                                    onChange={() => {
                                      const updated = [...appState.currentRequest!.body.urlencoded!];
                                      const itemIndex = updated.findIndex(u => u.id === item.id);
                                      if (itemIndex >= 0) {
                                        updated[itemIndex] = { ...updated[itemIndex], enabled: !updated[itemIndex].enabled };
                                        updateCurrentRequest({ body: { ...appState.currentRequest!.body, urlencoded: updated } });
                                      }
                                    }}
                                    style={{ cursor: 'pointer' }}
                                  />
                                  <Input
                                    size="small"
                                    placeholder="Field name"
                                    value={item.key}
                                    onChange={(e) => {
                                      const updated = [...appState.currentRequest!.body.urlencoded!];
                                      const itemIndex = updated.findIndex(u => u.id === item.id);
                                      if (itemIndex >= 0) {
                                        updated[itemIndex] = { ...updated[itemIndex], key: e.target.value };
                                        updateCurrentRequest({ body: { ...appState.currentRequest!.body, urlencoded: updated } });
                                      }
                                    }}
                                    style={{ fontFamily: 'monospace' }}
                                  />
                                  <Input
                                    size="small"
                                    placeholder="Field value"
                                    value={item.value}
                                    onChange={(e) => {
                                      const updated = [...appState.currentRequest!.body.urlencoded!];
                                      const itemIndex = updated.findIndex(u => u.id === item.id);
                                      if (itemIndex >= 0) {
                                        updated[itemIndex] = { ...updated[itemIndex], value: e.target.value };
                                        updateCurrentRequest({ body: { ...appState.currentRequest!.body, urlencoded: updated } });
                                      }
                                    }}
                                    style={{ fontFamily: 'monospace' }}
                                  />
                                  <Button
                                    type="text"
                                    size="small"
                                    danger
                                    icon={<DeleteOutlined />}
                                    onClick={() => {
                                      const updated = appState.currentRequest!.body.urlencoded!.filter(u => u.id !== item.id);
                                      updateCurrentRequest({ body: { ...appState.currentRequest!.body, urlencoded: updated } });
                                    }}
                                  />
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>No form data</div>
                          )}
                        </div>
                      )}
                    </div>
                  </TabPane>

                  <TabPane tab="Scripts" key="scripts" style={{ flex: 1, overflow: 'auto' }}>
                    <div style={{ padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 16, height: '100%', overflow: 'hidden' }}>
                      <Collapse>
                        <Collapse.Panel header="Pre-request Script" key="1" style={{ flex: 1 }}>
                          <div style={{ height: '300px', overflow: 'hidden' }}>
                            <Editor
                              onMount={(editor) => { preScriptEditorRef.current = editor; }}
                              height="100%"
                              language="javascript"
                              value={appState.currentRequest?.scripts?.preRequest || ''}
                              onChange={(value) => updateCurrentRequest({
                                scripts: {
                                  ...appState.currentRequest!.scripts,
                                  preRequest: value || '',
                                },
                              })}
                              theme="vs-light"
                              options={{
                                minimap: { enabled: false },
                                fontSize: 12,
                                lineNumbers: 'on',
                                wordWrap: 'on',
                                formatOnPaste: true,
                                formatOnType: true,
                              }}
                            />
                          </div>
                        </Collapse.Panel>
                        <Collapse.Panel header="Post-response Script" key="2" style={{ flex: 1 }}>
                          <div style={{ height: '300px', overflow: 'hidden' }}>
                            <Editor
                              onMount={(editor) => { postScriptEditorRef.current = editor; }}
                              height="100%"
                              language="javascript"
                              value={appState.currentRequest?.scripts?.postResponse || ''}
                              onChange={(value) => updateCurrentRequest({
                                scripts: {
                                  ...appState.currentRequest!.scripts,
                                  postResponse: value || '',
                                },
                              })}
                              theme="vs-light"
                              options={{
                                minimap: { enabled: false },
                                fontSize: 12,
                                lineNumbers: 'on',
                                wordWrap: 'on',
                                formatOnPaste: true,
                                formatOnType: true,
                              }}
                            />
                          </div>
                        </Collapse.Panel>
                      </Collapse>
                    </div>
                  </TabPane>
                </Tabs>
              </div>
              
              {/* Right - Response Panel */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderLeft: '2px solid #f0f0f0', paddingLeft: 16 }}>
                {appState.response ? (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ padding: '12px 0', background: '#fafafa', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 16, fontSize: 12 }}>
                      <span style={{ fontWeight: 'bold' }}>响应 {appState.response.status} {appState.response.statusText}</span>
                      <span>{appState.response.responseTime.toFixed(2)}ms</span>
                      <span>{appState.response.responseSize} bytes</span>
                    </div>
                    <Tabs defaultActiveKey="body" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }} tabBarStyle={{ margin: 0, borderBottom: '1px solid #f0f0f0', background: '#fafafa', flexShrink: 0 }}>
                      <TabPane tab="Body" key="body" style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ height: 900, overflow: 'hidden', background: '#fff', border: '1px solid #d9d9d9', borderRadius: 4, position: 'relative' }}>
                          <Button
                            type="text"
                            size="small"
                            icon={<CopyOutlined />}
                            onClick={() => {
                              const content = appState.response?.body || '';
                              navigator.clipboard.writeText(content).then(() => {
                                message.success('Response body copied');
                              }).catch(err => {
                                console.error('Failed to copy:', err);
                                message.error('Copy failed');
                              });
                            }}
                            style={{
                              position: 'absolute',
                              top: 8,
                              right: 8,
                              zIndex: 10,
                            }}
                            title="Copy response body"
                          />
                          <Editor
                            onMount={(editor) => { responseEditorRef.current = editor; }}
                            height="100%"
                            language={detectResponseLanguage(appState.response?.body || '', appState.response?.headers['content-type'] || '')}
                            value={formatResponseBody(appState.response?.body || '', appState.response?.headers['content-type'] || '')}
                            options={{
                              readOnly: true,
                              minimap: { enabled: false },
                              fontSize: 14,
                              lineNumbers: 'on',
                              wordWrap: 'on',
                              padding: { top: 10, bottom: 10 },
                            }}
                            theme="vs-light"
                          />
                        </div>
                      </TabPane>
                      <TabPane tab="Headers" key="headers" style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ height: 900, overflow: 'auto', background: '#fff' }}>
                          {appState.response && Object.keys(appState.response.headers).length > 0 ? (
                            <div style={{ border: '1px solid #d9d9d9', borderRadius: 4, overflow: 'hidden' }}>
                              {/* Header */}
                              <div style={{ padding: '8px 12px', background: '#fafafa', display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, alignItems: 'center', fontSize: 12, fontWeight: 'bold', borderBottom: '1px solid #d9d9d9' }}>
                                <span>Key</span>
                                <span>Value</span>
                              </div>
                              {/* Rows */}
                              {appState.response && Object.entries(appState.response.headers).map(([key, value], idx) => (
                                <div key={key} style={{ padding: '10px 12px', borderBottom: idx < Object.keys(appState.response!.headers).length - 1 ? '1px solid #f0f0f0' : 'none', display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, fontSize: 13, alignItems: 'flex-start' }}>
                                  <span style={{ fontFamily: 'monospace', color: '#0066cc', fontWeight: 500 }}>{key}</span>
                                  <span style={{ fontFamily: 'monospace', wordBreak: 'break-all', fontWeight: 400 }}>{String(value)}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>No headers</div>
                          )}
                        </div>
                      </TabPane>
                      <TabPane tab="Cookies" key="cookies" style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ height: 900, overflow: 'auto', background: '#fff' }}>
                          {appState.response && appState.response.headers['set-cookie'] ? (
                            <div style={{ border: '1px solid #d9d9d9', borderRadius: 4, overflow: 'hidden' }}>
                              {/* Header */}
                              <div style={{ padding: '8px 12px', background: '#fafafa', display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 12, alignItems: 'center', fontSize: 12, fontWeight: 'bold', borderBottom: '1px solid #d9d9d9' }}>
                                <span>Name</span>
                                <span>Value</span>
                                <span>Domain</span>
                              </div>
                              {/* Rows */}
                              {appState.response && (Array.isArray(appState.response.headers['set-cookie']) 
                                ? appState.response.headers['set-cookie']
                                : [appState.response.headers['set-cookie']]
                              ).map((cookie, idx) => {
                                const [nameVal, ...params] = String(cookie).split(';');
                                const [name, value] = nameVal.split('=');
                                const cookieList = Array.isArray(appState.response!.headers['set-cookie']) 
                                  ? appState.response!.headers['set-cookie']
                                  : [appState.response!.headers['set-cookie']];
                                return (
                                  <div key={idx} style={{ padding: '8px 12px', borderBottom: idx < cookieList.length - 1 ? '1px solid #f0f0f0' : 'none', display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 12, fontSize: 12 }}>
                                    <span style={{ fontFamily: 'monospace' }}>{name}</span>
                                    <span style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{value}</span>
                                    <span style={{ fontFamily: 'monospace' }}>-</span>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>No cookies</div>
                          )}
                        </div>
                      </TabPane>
                      <TabPane tab="Test Results" key="test" style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ height: 900, overflow: 'auto', background: '#fff', padding: '16px' }}>
                          <div style={{ color: '#999', textAlign: 'center', paddingTop: '100px' }}>
                            <p>No test results yet</p>
                            <p style={{ fontSize: 12 }}>Run tests from the Pre-request Script or Post-response Script</p>
                          </div>
                        </div>
                      </TabPane>
                    </Tabs>
                  </div>
                ) : (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
                    暂无响应
                  </div>
                )}
              </div>
            </div>
          )}
        </Content>
      </Layout>
    </Layout>

      {/* Create Collection Modal */}
      <Modal
        title="新建文件夹"
        open={appState.showCollectionModal}
        onOk={createNewCollection}
        onCancel={() => setAppState(prev => ({ ...prev, showCollectionModal: false }))}
        okText="创建"
        cancelText="取消"
      >
        <Input
          placeholder="输入文件夹名称"
          value={appState.newCollectionName}
          onChange={(e) => setAppState(prev => ({ ...prev, newCollectionName: e.target.value }))}
          onPressEnter={createNewCollection}
        />
      </Modal>

      {/* Settings Modal */}
      <Modal
        title="设置"
        open={appState.showSettingsModal}
        onCancel={() => setAppState(prev => ({ ...prev, showSettingsModal: false }))}
        footer={[
          <Button key="close" onClick={() => setAppState(prev => ({ ...prev, showSettingsModal: false }))}>关闭</Button>,
        ]}
      >
        <div style={{ marginBottom: 20 }}>
          <p><strong>超时设置 (毫秒):</strong></p>
          <Input
            type="number"
            value={appState.settings?.defaultTimeout || 30000}
            onChange={(e) => setAppState(prev => ({
              ...prev,
              settings: prev.settings ? { ...prev.settings, defaultTimeout: Number(e.target.value) } : null,
            }))}
          />
        </div>
        <div style={{ marginBottom: 20 }}>
          <p><strong>历史过期天数:</strong></p>
          <Input
            type="number"
            value={appState.settings?.historyExpireDays || 30}
            onChange={(e) => setAppState(prev => ({
              ...prev,
              settings: prev.settings ? { ...prev.settings, historyExpireDays: Number(e.target.value) } : null,
            }))}
          />
        </div>
        <div>
          <p><strong>最大历史条数:</strong></p>
          <Input
            type="number"
            value={appState.settings?.maxHistorySize || 1000}
            onChange={(e) => setAppState(prev => ({
              ...prev,
              settings: prev.settings ? { ...prev.settings, maxHistorySize: Number(e.target.value) } : null,
            }))}
          />
        </div>
      </Modal>

      {/* Save Request Modal */}
      <Modal
        title="保存请求"
        open={appState.showRequestNameModal}
        onOk={confirmSaveRequest}
        onCancel={() => setAppState(prev => ({ ...prev, showRequestNameModal: false }))}
        okText="保存"
        cancelText="取消"
        width={500}
      >
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>
            请求名称
            {appState.currentRequest && !appState.requestName.trim() && appState.currentRequest.url && (
              <span style={{ fontSize: 12, color: '#999', fontWeight: 'normal' }}>
                （未输入时将使用 URL：{appState.currentRequest.url}）
              </span>
            )}
          </label>
          <Input
            placeholder={appState.currentRequest?.url || '输入请求名称'}
            value={appState.requestName}
            onChange={(e) => setAppState(prev => ({ ...prev, requestName: e.target.value }))}
            onPressEnter={confirmSaveRequest}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>
            保存到文件夹
          </label>
          <Select
            placeholder="选择文件夹"
            value={appState.saveToCollectionId || undefined}
            onChange={(value) => setAppState(prev => ({ ...prev, saveToCollectionId: value }))}
            style={{ width: 280 }}
          >
            {appState.collections.map(collection => (
              <Select.Option key={collection.id} value={collection.id}>
                {collection.name}
              </Select.Option>
            ))}
          </Select>
          {appState.collections.length === 0 && (
            <p style={{ color: '#ff4d4f', marginTop: 8, fontSize: 12 }}>
              ⚠️ 请先创建一个文件夹
            </p>
          )}
        </div>
      </Modal>

      {/* Edit Request Modal */}
      <Modal
        title="编辑请求"
        open={appState.showEditRequestModal}
        onOk={saveEditedRequest}
        onCancel={() => setAppState(prev => ({
          ...prev,
          showEditRequestModal: false,
          editRequestModalId: null,
          editRequestModalName: '',
          editRequestModalCollectionId: null,
          editRequestModalSourceCollectionId: null,
        }))}
        width={500}
        footer={[
          <Button key="delete" danger onClick={deleteEditedRequest}>
            删除
          </Button>,
          <Button key="cancel" onClick={() => setAppState(prev => ({
            ...prev,
            showEditRequestModal: false,
            editRequestModalId: null,
            editRequestModalName: '',
            editRequestModalCollectionId: null,
            editRequestModalSourceCollectionId: null,
          }))}>
            取消
          </Button>,
          <Button key="submit" type="primary" onClick={saveEditedRequest}>
            保存
          </Button>,
        ]}
      >
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>
            请求名称
          </label>
          <Input
            placeholder="输入请求名称"
            value={appState.editRequestModalName || ''}
            onChange={(e) => setAppState(prev => ({
              ...prev,
              editRequestModalName: e.target.value,
            }))}
            onPressEnter={saveEditedRequest}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>
            所属文件夹
          </label>
          <Select
            placeholder="选择文件夹"
            value={appState.editRequestModalCollectionId || undefined}
            onChange={(value) => setAppState(prev => ({
              ...prev,
              editRequestModalCollectionId: value,
            }))}
            style={{ width: 280 }}
          >
            {appState.collections.map(collection => (
              <Select.Option key={collection.id} value={collection.id}>
                {collection.name}
              </Select.Option>
            ))}
          </Select>
        </div>
      </Modal>
    </Layout>
  );
};

export default ApiDebugTool;