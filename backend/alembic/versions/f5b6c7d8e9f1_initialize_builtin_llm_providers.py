"""initialize_builtin_llm_providers

Revision ID: f5b6c7d8e9f1
Revises: f5b6c7d8e9f0
Create Date: 2025-11-10 10:47:17.641796

"""
from typing import Sequence, Union
from datetime import datetime

from alembic import op
import sqlalchemy as sa
from sqlalchemy import table, column, String, Integer, Boolean, JSON, Text


# revision identifiers, used by Alembic.
revision: str = 'f5b6c7d8e9f1'
down_revision: Union[str, None] = 'f5b6c7d8e9f0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


BUILTIN_PROVIDERS = [
    {
        "name": "gemini",
        "display_name": "Google Gemini",
        "description": "Google's Gemini AI models",
        "icon": "🔵",
        "provider_type": "gemini",
        "default_model": "gemini-1.5-flash",
        "supported_models": ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro"],
        "requires_api_key": True,
        "supports_streaming": True,
        "max_tokens_limit": 8192,
        "category": "international",
        "is_active": True,
        "is_builtin": True,
    },
    {
        "name": "openai",
        "display_name": "OpenAI GPT",
        "description": "OpenAI's GPT models",
        "icon": "🟢",
        "provider_type": "openai",
        "default_model": "gpt-4o-mini",
        "supported_models": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
        "requires_api_key": True,
        "supports_streaming": True,
        "max_tokens_limit": 16384,
        "category": "international",
        "is_active": True,
        "is_builtin": True,
    },
    {
        "name": "claude",
        "display_name": "Anthropic Claude",
        "description": "Anthropic's Claude AI models",
        "icon": "🟣",
        "provider_type": "claude",
        "default_model": "claude-3-5-sonnet-20241022",
        "supported_models": ["claude-3-5-sonnet-20241022", "claude-3-opus", "claude-3-sonnet", "claude-3-haiku"],
        "requires_api_key": True,
        "supports_streaming": True,
        "max_tokens_limit": 8192,
        "category": "international",
        "is_active": True,
        "is_builtin": True,
    },
    {
        "name": "bedrock",
        "display_name": "AWS Bedrock Claude",
        "description": "AWS Bedrock Claude 3.5 Sonnet (us-east-1)",
        "icon": "🟧",
        "provider_type": "bedrock",
        "api_endpoint": "us-east-1",  # AWS region
        "default_model": "anthropic.claude-3-5-sonnet-20241022-v2:0",
        "supported_models": [
            "anthropic.claude-3-5-sonnet-20241022-v2:0",
            "anthropic.claude-3-5-sonnet-20240620-v1:0",
            "anthropic.claude-3-opus-20240229-v1:0",
            "anthropic.claude-3-sonnet-20240229-v1:0",
            "anthropic.claude-3-haiku-20240307-v1:0"
        ],
        "requires_api_key": True,  # Requires AWS credentials
        "supports_streaming": True,
        "max_tokens_limit": 4096,
        "category": "international",
        "is_active": True,
        "is_builtin": True,
        "config": {
            "region_name": "us-east-1",
            "note": "Uses AWS credentials from environment (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY) or IAM role"
        }
    },
    {
        "name": "deepseek",
        "display_name": "DeepSeek",
        "description": "DeepSeek AI models",
        "icon": "🔷",
        "provider_type": "deepseek",
        "default_model": "deepseek-chat",
        "supported_models": ["deepseek-chat", "deepseek-coder"],
        "requires_api_key": True,
        "supports_streaming": True,
        "max_tokens_limit": 8192,
        "category": "international",
        "is_active": True,
        "is_builtin": True,
    },
    {
        "name": "qwen",
        "display_name": "阿里云通义千问",
        "description": "Alibaba Cloud Qwen models",
        "icon": "🟠",
        "provider_type": "qwen",
        "default_model": "qwen-turbo",
        "supported_models": ["qwen-turbo", "qwen-plus", "qwen-max"],
        "requires_api_key": True,
        "supports_streaming": True,
        "max_tokens_limit": 6000,
        "category": "domestic",
        "is_active": True,
        "is_builtin": True,
    },
    {
        "name": "zhipu",
        "display_name": "智谱AI (GLM)",
        "description": "Zhipu AI GLM models",
        "icon": "🔴",
        "provider_type": "zhipu",
        "default_model": "glm-4-flash",
        "supported_models": ["glm-4-flash", "glm-4", "glm-3-turbo"],
        "requires_api_key": True,
        "supports_streaming": True,
        "max_tokens_limit": 8192,
        "category": "domestic",
        "is_active": True,
        "is_builtin": True,
    },
    {
        "name": "moonshot",
        "display_name": "Moonshot (Kimi)",
        "description": "Moonshot AI Kimi models",
        "icon": "🌙",
        "provider_type": "moonshot",
        "default_model": "moonshot-v1-8k",
        "supported_models": ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"],
        "requires_api_key": True,
        "supports_streaming": True,
        "max_tokens_limit": 8192,
        "category": "domestic",
        "is_active": True,
        "is_builtin": True,
    },
    {
        "name": "baidu",
        "display_name": "百度文心一言",
        "description": "Baidu ERNIE models",
        "icon": "🔵",
        "provider_type": "baidu",
        "default_model": "ERNIE-3.5-8K",
        "supported_models": ["ERNIE-4.0-8K", "ERNIE-3.5-8K", "ERNIE-Speed"],
        "requires_api_key": True,
        "supports_streaming": True,
        "max_tokens_limit": 8000,
        "category": "domestic",
        "is_active": True,
        "is_builtin": True,
    },
    {
        "name": "minimax",
        "display_name": "MiniMax",
        "description": "MiniMax AI models",
        "icon": "⚡",
        "provider_type": "minimax",
        "default_model": "abab6.5-chat",
        "supported_models": ["abab6.5-chat", "abab5.5-chat"],
        "requires_api_key": True,
        "supports_streaming": True,
        "max_tokens_limit": 8192,
        "category": "domestic",
        "is_active": True,
        "is_builtin": True,
    },
    {
        "name": "doubao",
        "display_name": "字节豆包",
        "description": "ByteDance Doubao models",
        "icon": "🎯",
        "provider_type": "doubao",
        "default_model": "doubao-pro-32k",
        "supported_models": ["doubao-pro-32k", "doubao-lite-32k"],
        "requires_api_key": True,
        "supports_streaming": True,
        "max_tokens_limit": 32000,
        "category": "domestic",
        "is_active": True,
        "is_builtin": True,
    },
    {
        "name": "ollama",
        "display_name": "Ollama 本地模型",
        "description": "Local Ollama models",
        "icon": "🖥️",
        "provider_type": "ollama",
        "api_endpoint": "http://localhost:11434",
        "default_model": "qwen3-coder:30b",
        "supported_models": ["qwen3-coder:30b", "llama3", "mistral", "codellama"],
        "requires_api_key": False,
        "supports_streaming": True,
        "max_tokens_limit": 8192,
        "category": "local",
        "is_active": True,
        "is_builtin": True,
    },
]


def upgrade() -> None:
    """Insert built-in LLM providers"""
    # Define the llm_providers table structure for bulk insert
    llm_providers = table(
        'llm_providers',
        column('name', String),
        column('display_name', String),
        column('description', Text),
        column('icon', String),
        column('provider_type', String),
        column('api_endpoint', String),
        column('default_model', String),
        column('supported_models', JSON),
        column('requires_api_key', Boolean),
        column('supports_streaming', Boolean),
        column('max_tokens_limit', Integer),
        column('category', String),
        column('is_active', Boolean),
        column('is_builtin', Boolean),
        column('config', JSON),
        column('created_at', sa.DateTime),
        column('updated_at', sa.DateTime),
    )
    
    now = datetime.utcnow()
    
    # Prepare data for insertion
    providers_data = []
    for provider in BUILTIN_PROVIDERS:
        data = {
            'name': provider['name'],
            'display_name': provider['display_name'],
            'description': provider['description'],
            'icon': provider['icon'],
            'provider_type': provider['provider_type'],
            'api_endpoint': provider.get('api_endpoint'),
            'default_model': provider['default_model'],
            'supported_models': provider['supported_models'],
            'requires_api_key': provider['requires_api_key'],
            'supports_streaming': provider['supports_streaming'],
            'max_tokens_limit': provider['max_tokens_limit'],
            'category': provider['category'],
            'is_active': provider['is_active'],
            'is_builtin': provider['is_builtin'],
            'config': provider.get('config'),
            'created_at': now,
            'updated_at': now,
        }
        providers_data.append(data)
    
    # Insert all providers
    op.bulk_insert(llm_providers, providers_data)
    
    print(f"✅ Initialized {len(providers_data)} built-in LLM providers")


def downgrade() -> None:
    """Remove built-in LLM providers"""
    # Delete all built-in providers
    op.execute(
        "DELETE FROM llm_providers WHERE is_builtin = true"
    )
    
    print("✅ Removed all built-in LLM providers")

